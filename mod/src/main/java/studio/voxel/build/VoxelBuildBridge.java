package studio.voxel.build;

import com.google.gson.*;
import com.mojang.brigadier.StringReader;
import com.sun.net.httpserver.*;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.*;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.block.*;
import net.minecraft.command.argument.BlockArgumentParser;
import net.minecraft.registry.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.*;
import net.minecraft.util.math.*;
import org.slf4j.*;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

public final class VoxelBuildBridge implements ModInitializer {
    private static final Logger LOG = LoggerFactory.getLogger("voxel-build");
    private static final Gson JSON = new GsonBuilder().disableHtmlEscaping().create();
    private static final int FLAGS = Block.NOTIFY_LISTENERS | Block.FORCE_STATE_AND_SKIP_CALLBACKS_AND_DROPS;
    private MinecraftServer server;
    private HttpServer http;
    private ExecutorService executor;
    private Path journals;
    private String worldId, token;
    private Job active;
    private final Map<String,BlockState> stateCache=new HashMap<>();
    private final Map<String,Job> jobs = new LinkedHashMap<>();
    private final Set<Long> pinned = new HashSet<>();
    private ServerWorld pinnedWorld;
    public void onInitialize() {
        ServerLifecycleEvents.SERVER_STARTED.register(this::start);
        ServerLifecycleEvents.SERVER_STOPPING.register(s -> stop());
        ServerTickEvents.END_SERVER_TICK.register(s -> tick());
    }
    private void start(MinecraftServer s) {
        try {
            server=s;stateCache.clear();
            Path root=s.getSavePath(WorldSavePath.ROOT).resolve("voxel-build");
            journals=root.resolve("journal");Files.createDirectories(journals);
            Path identity=root.resolve("world-id.txt");
            if(!Files.exists(identity)) Files.writeString(identity,UUID.randomUUID().toString(),StandardOpenOption.CREATE_NEW);
            worldId=Files.readString(identity).trim();
            Path file=FabricLoader.getInstance().getConfigDir().resolve("voxel-build.json");
            JsonObject config;
            if(Files.exists(file)) config=JsonParser.parseString(Files.readString(file)).getAsJsonObject();
            else {
                config=new JsonObject();config.addProperty("port",25578);config.addProperty("enabled",true);
                byte[] secret=new byte[32];new SecureRandom().nextBytes(secret);
                config.addProperty("token",HexFormat.of().formatHex(secret));atomic(file,JSON.toJson(config));
            }
            if(config.has("enabled")&&!config.get("enabled").getAsBoolean()) return;
            token=config.get("token").getAsString();int port=config.get("port").getAsInt();
            require(token.matches("[a-f0-9]{64}")&&port>=1024&&port<=65535,"Invalid bridge config");
            jobs.clear();active=null;
            try(var files=Files.list(journals)) {
                for(Path p:files.filter(p -> p.toString().endsWith(".json")).toList()) {
                    Job j=JSON.fromJson(Files.readString(p),Job.class);
                    if(!Set.of("complete","rolled_back","rejected","rollback_conflict").contains(j.phase)) j.phase="interrupted";
                    j.total=j.changes.size();j.changes=null;
                    jobs.put(j.id,j);
                    if(j.phase.equals("interrupted")) {
                        ServerWorld w=server.getWorld(RegistryKey.of(RegistryKeys.WORLD,Identifier.of(j.dimension)));
                        if(w!=null&&j.ownedPins!=null) for(long id:j.ownedPins) {ChunkPos cp=new ChunkPos(id);w.setChunkForced(cp.x,cp.z,false);}
                    }
                }
            }
            http=HttpServer.create(new InetSocketAddress("127.0.0.1",port),4);
            executor=Executors.newSingleThreadExecutor(r -> {Thread t=new Thread(r,"Voxel-Build-HTTP");t.setDaemon(true);return t;});
            http.setExecutor(executor);http.createContext("/",this::handle);http.start();
            LOG.info("Voxel Build on 127.0.0.1:{}; config {}; world {}",port,file,worldId);
        } catch(Exception e) {stop();LOG.error("Voxel Build startup failed",e);}
    }
    private void stop() {
        if(http!=null) {http.stop(0);http=null;}
        if(executor!=null) {executor.shutdownNow();executor=null;}
        release();server=null;active=null;
    }
    private static void atomic(Path p,String value) throws IOException {
        Files.createDirectories(p.getParent());Path tmp=p.resolveSibling(p.getFileName()+".tmp");
        try(var channel=java.nio.channels.FileChannel.open(tmp,StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING,StandardOpenOption.WRITE)) {
            var buffer=java.nio.ByteBuffer.wrap(value.getBytes(StandardCharsets.UTF_8));while(buffer.hasRemaining()) channel.write(buffer);channel.force(true);
        }
        try {Files.move(tmp,p,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
        catch(AtomicMoveNotSupportedException e) {Files.move(tmp,p,StandardCopyOption.REPLACE_EXISTING);}
    }
    private Job loadJob(String id) {
        Job j=jobs.get(id);if(j==null||j.changes!=null) return j;
        try {Job loaded=JSON.fromJson(Files.readString(journals.resolve(id+".json")),Job.class);loaded.phase=j.phase;return loaded;}
        catch(IOException e) {throw new IllegalStateException("Cannot read transaction journal",e);}
    }
    private void persist(Job j) {
        if(j.changes!=null) j.total=j.changes.size();
        try {atomic(journals.resolve(j.id+".json"),JSON.toJson(j));}
        catch(IOException e) {throw new IllegalStateException("Journal write failed",e);}
    }
    private <T> T mainThread(Supplier<T> fn) throws Exception {
        MinecraftServer s=server;require(s!=null,"World is closing");
        CompletableFuture<T> f=new CompletableFuture<>();
        s.execute(() -> {if(!f.isCancelled()) {try {f.complete(fn.get());}catch(Throwable e) {f.completeExceptionally(e);}}});
        try {return f.get(50,TimeUnit.SECONDS);}
        catch(TimeoutException e) {f.cancel(false);throw new IllegalStateException("Minecraft is paused/busy. Resume and retry the same request ID.");}
    }
    private void handle(HttpExchange ex) throws IOException {
        int code=200;Object result;
        try {
            String auth=ex.getRequestHeaders().getFirst("Authorization");
            require(ex.getRequestHeaders().getFirst("Origin")==null&&auth!=null&&MessageDigest.isEqual(auth.getBytes(StandardCharsets.UTF_8),("Bearer "+token).getBytes(StandardCharsets.UTF_8)),"Forbidden");
            String route=ex.getRequestURI().getPath();
            if(ex.getRequestMethod().equals("GET")) result=mainThread(() -> switch(route) {
                case "/status" -> status();
                case "/job" -> job(ex.getRequestURI().getRawQuery()).summary();
                default -> throw new IllegalArgumentException("Unknown route");
            });
            else {
                require(ex.getRequestMethod().equals("POST"),"Expected POST");
                byte[] bytes=ex.getRequestBody().readNBytes(8*1024*1024+1);require(bytes.length<=8*1024*1024,"Request exceeds 8 MB");
                JsonObject body=JsonParser.parseString(new String(bytes,StandardCharsets.UTF_8)).getAsJsonObject();
                result=mainThread(() -> switch(route) {
                    case "/snapshot" -> snapshot(body);
                    case "/states" -> states(body);
                    case "/apply" -> submit(body);
                    case "/recover" -> recover(body);
                    default -> throw new IllegalArgumentException("Unknown route");
                });
            }
        } catch(Exception e) {
            Throwable cause=e instanceof ExecutionException?e.getCause():e;
            String message=Objects.toString(cause.getMessage(),cause.getClass().getSimpleName());
            code=message.equals("Forbidden")?403:400;result=Map.of("error",message);
        }
        byte[] bytes=JSON.toJson(result).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type","application/json");ex.getResponseHeaders().set("Cache-Control","no-store");
        ex.sendResponseHeaders(code,bytes.length);ex.getResponseBody().write(bytes);ex.close();
    }
    private Object status() {
        List<String> dimensions=new ArrayList<>();server.getWorlds().forEach(w -> dimensions.add(w.getRegistryKey().getValue().toString()));
        return Map.of("connected",true,"protocol",1,"minecraft","1.21.11","worldId",worldId,"dimensions",dimensions,
            "players",server.getPlayerManager().getPlayerList().stream().map(p -> Map.of("name",p.getName().getString(),"position",List.of(p.getX(),p.getY(),p.getZ()),"dimension",p.getEntityWorld().getRegistryKey().getValue().toString())).toList(),
            "activeJob",active==null?"":active.id,"recoveryRequired",jobs.values().stream().filter(j -> j.phase.equals("interrupted")||j.phase.equals("rollback_conflict")).map(Job::summary).toList());
    }
    private Job job(String query) {
        require(query!=null&&query.startsWith("id="),"Missing job ID");Job j=jobs.get(query.substring(3));require(j!=null,"Unknown job ID");return j;
    }
    private ServerWorld world(JsonObject body) {
        require(worldId.equals(body.get("worldId").getAsString()),"World identity mismatch");
        ServerWorld w=server.getWorld(RegistryKey.of(RegistryKeys.WORLD,Identifier.of(body.get("dimension").getAsString())));
        require(w!=null,"Unknown dimension");return w;
    }
    private static int[] xyz(JsonElement value) {
        JsonArray a=value.getAsJsonArray();require(a.size()==3,"Expected three coordinates");int[] out=new int[3];
        for(int i=0;i<3;i++) {double n=a.get(i).getAsDouble();require(Double.isFinite(n)&&n==Math.rint(n)&&Math.abs(n)<30_000_000,"Invalid coordinate");out[i]=(int)n;}
        return out;
    }
    private static void location(ServerWorld w,BlockPos p) {require(!w.isOutOfHeightLimit(p)&&w.getWorldBorder().contains(p),"Outside world height/border: "+p);}
    private Object snapshot(JsonObject body) {
        require(active==null,"Wait for active transaction before capturing");ServerWorld w=world(body);JsonObject b=body.getAsJsonObject("bounds");
        int[] a=xyz(b.get("min")),z=xyz(b.get("max"));long volume=1;
        for(int i=0;i<3;i++) {require(z[i]>=a[i],"Reversed bounds");volume*=((long)z[i]-a[i]+1);require(volume<=65536,"Snapshot exceeds 65,536 cells; tile the area");}
        location(w,new BlockPos(a[0],a[1],a[2]));location(w,new BlockPos(z[0],z[1],z[2]));
        require((z[0]>>4)-(a[0]>>4)<=16&&(z[2]>>4)-(a[2]>>4)<=16,"Snapshot spans too many chunks");
        Map<String,Integer> palette=new LinkedHashMap<>();List<int[]> blocks=new ArrayList<>(),protectedPositions=new ArrayList<>();
        for(int y=a[1];y<=z[1];y++) for(int zz=a[2];zz<=z[2];zz++) for(int x=a[0];x<=z[0];x++) {
            BlockPos p=new BlockPos(x,y,zz);BlockState s=w.getBlockState(p);if(s.hasBlockEntity()) protectedPositions.add(new int[]{x,y,zz});if(s.isAir()) continue;
            String text=BlockArgumentParser.stringifyBlockState(s);int id=palette.computeIfAbsent(text,k -> palette.size());blocks.add(new int[]{x,y,zz,id});
        }
        return Map.of("worldId",worldId,"dimension",w.getRegistryKey().getValue().toString(),"palette",palette.keySet(),"blocks",blocks,"protected",protectedPositions);
    }
    private BlockState parse(String text) {
        BlockState cached=stateCache.get(text);if(cached!=null) return cached;
        require(text.length()<=512&&!text.contains("{")&&!text.contains("#"),"Only block states are accepted; block entity NBT is excluded");
        try {
            StringReader reader=new StringReader(text);
            BlockState s=BlockArgumentParser.block(server.getRegistryManager().getOrThrow(RegistryKeys.BLOCK),reader,false).blockState();
            require(!reader.canRead(),"Trailing block-state input");if(stateCache.size()>16384) stateCache.clear();stateCache.put(text,s);return s;
        } catch(Exception e) {throw new IllegalArgumentException("Invalid block state "+text+": "+e.getMessage());}
    }
    private Object states(JsonObject body) {
        JsonArray a=body.getAsJsonArray("states");require(a.size()<=256,"Maximum 256 states");List<String> out=new ArrayList<>();
        for(JsonElement e:a) {BlockState s=parse(e.getAsString());require(!s.hasBlockEntity(),"Creating block entities is not supported: "+e.getAsString());out.add(BlockArgumentParser.stringifyBlockState(s));}return Map.of("states",out);
    }
    private Object submit(JsonObject body) {
        String id=body.get("id").getAsString();require(id.matches("[a-zA-Z0-9_-]{1,80}"),"Invalid transaction ID");ServerWorld w=world(body);
        List<Change> changes=new ArrayList<>();Set<BlockPos> unique=new HashSet<>();JsonArray input=body.getAsJsonArray("changes");
        require(input.size()>0&&input.size()<=8192,"Transaction requires 1..8192 changes");
        for(JsonElement item:input) {
            JsonObject c=item.getAsJsonObject();int[] p=xyz(c.get("pos"));BlockPos at=new BlockPos(p[0],p[1],p[2]);location(w,at);require(unique.add(at),"Duplicate position");
            BlockState before=parse(c.get("before").getAsString()),after=parse(c.get("after").getAsString());
            require(!before.hasBlockEntity()&&!after.hasBlockEntity(),"Block entities are protected and cannot be created/removed by this bridge");
            changes.add(new Change(p,BlockArgumentParser.stringifyBlockState(before),BlockArgumentParser.stringifyBlockState(after)));
        }
        Job existing=loadJob(id);
        if(existing!=null) {
            require(existing.dimension.equals(w.getRegistryKey().getValue().toString())&&JSON.toJson(existing.changes).equals(JSON.toJson(changes)),"Transaction ID already used for different edits");return existing.summary();
        }
        require(active==null,"Another transaction is running");
        require(jobs.values().stream().noneMatch(j -> j.phase.equals("interrupted")||j.phase.equals("rollback_conflict")),"Recover interrupted journals before new changes");
        Set<Long> chunks=new HashSet<>();for(Change c:changes) chunks.add(new ChunkPos(c.pos[0]>>4,c.pos[2]>>4).toLong());require(chunks.size()<=64,"Transaction exceeds 64 chunks; group edits spatially");
        Job j=new Job();j.id=id;j.dimension=w.getRegistryKey().getValue().toString();j.changes=changes;j.phase="validating";
        persist(j);jobs.put(id,j);active=j;pin(w,chunks);return j.summary();
    }
    private void pin(ServerWorld w,Set<Long> chunks) {
        pinnedWorld=w;active.ownedPins=new ArrayList<>();
        for(long id:chunks) if(!w.getForcedChunks().contains(id)) active.ownedPins.add(id);
        persist(active);
        for(long id:active.ownedPins) {ChunkPos p=new ChunkPos(id);w.setChunkForced(p.x,p.z,true);pinned.add(id);}
    }
    private void release() {
        if(pinnedWorld!=null) for(long id:pinned) {ChunkPos p=new ChunkPos(id);pinnedWorld.setChunkForced(p.x,p.z,false);}pinned.clear();pinnedWorld=null;
    }
    private Object recover(JsonObject body) {
        require(active==null,"Another transaction is running");ServerWorld w=world(body);Job j=loadJob(body.get("id").getAsString());
        require(j!=null&&j.dimension.equals(w.getRegistryKey().getValue().toString())&&(j.phase.equals("interrupted")||j.phase.equals("rollback_conflict")),"No interrupted job for that ID/dimension");
        j.phase="rolling_back";j.cursor=j.changes.size()-1;j.conflicts=0;persist(j);jobs.put(j.id,j);active=j;
        Set<Long> chunks=new HashSet<>();for(Change c:j.changes) chunks.add(new ChunkPos(c.pos[0]>>4,c.pos[2]>>4).toLong());pin(w,chunks);return j.summary();
    }
    private void tick() {
        if(active==null||server==null) return;Job j=active;ServerWorld w=server.getWorld(RegistryKey.of(RegistryKeys.WORLD,Identifier.of(j.dimension)));if(w==null) return;
        long deadline=System.nanoTime()+4_000_000;int budget=1024;
        try {
            while(budget-->0&&System.nanoTime()<deadline) {
                if(j.phase.equals("validating")) {
                    if(j.cursor==j.changes.size()) {j.phase="applying";j.cursor=0;persist(j);continue;}
                    Change c=j.changes.get(j.cursor++);BlockState actual=w.getBlockState(c.at());
                    if(actual.hasBlockEntity()||!same(actual,parse(c.before))) {j.error="World changed at "+c.at();finish(j,"rejected");return;}
                } else if(j.phase.equals("applying")) {
                    if(j.cursor==j.changes.size()) {finish(j,"complete");return;}
                    Change c=j.changes.get(j.cursor);BlockState actual=w.getBlockState(c.at());
                    if(actual.hasBlockEntity()||!same(actual,parse(c.before))) {j.error="Conflict at "+c.at();j.phase="rolling_back";j.cursor--;persist(j);continue;}
                    if(!actual.equals(parse(c.after))&&!w.setBlockState(c.at(),parse(c.after),FLAGS)) throw new IllegalStateException("Placement refused at "+c.at());j.applied++;j.cursor++;
                } else if(j.phase.equals("rolling_back")) {
                    if(j.cursor<0) {finish(j,j.conflicts>0?"rollback_conflict":"rolled_back");return;}
                    Change c=j.changes.get(j.cursor--);BlockState actual=w.getBlockState(c.at());if(same(actual,parse(c.before))) continue;
                    if(!actual.hasBlockEntity()&&actual.equals(parse(c.after))) {if(!w.setBlockState(c.at(),parse(c.before),FLAGS)) j.conflicts++;}else j.conflicts++;
                } else return;
            }
        } catch(Exception e) {
            j.error=e.getMessage();
            if(j.phase.equals("applying")) {j.phase="rolling_back";j.cursor=Math.min(j.cursor,j.changes.size()-1);try {persist(j);}catch(Exception ignored) {LOG.error("Journal persistence failed",e);}}
            else {j.phase="rollback_conflict";try {persist(j);}finally {active=null;release();}LOG.error("Voxel Build job failed",e);}
        }
    }
    private static boolean same(BlockState a,BlockState b) {return a.equals(b)||(a.isAir()&&b.isAir());}
    private void finish(Job j,String phase) {release();require(server.save(false,true,false),"Minecraft could not save world changes");j.phase=phase;persist(j);active=null;j.changes=null;}
    private static void require(boolean valid,String message) {if(!valid) throw new IllegalArgumentException(message);}
    private record Change(int[] pos,String before,String after) {BlockPos at(){return new BlockPos(pos[0],pos[1],pos[2]);}}
    private static final class Job {
        String id,dimension,phase,error="";List<Change> changes;List<Long> ownedPins;int cursor,applied,conflicts,total;
        Object summary(){return Map.of("id",id,"phase",phase,"total",changes==null?total:changes.size(),"cursor",cursor,"applied",applied,"conflicts",conflicts,"error",error==null?"":error);}
    }
}
