package studio.voxel.build;

import com.google.gson.*;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.block.Blocks;
import net.minecraft.test.TestContext;
import net.minecraft.util.math.BlockPos;
import java.net.URI;
import java.net.http.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

public final class BridgeGameTest {
    private static final Gson JSON=new Gson();
    @GameTest(maxTicks=10000)
    public void roundTrip(TestContext ctx) throws Exception {
        BlockPos at=ctx.getAbsolutePos(new BlockPos(2,2,2));
        ctx.getWorld().setBlockState(at,Blocks.AIR.getDefaultState());
        ctx.getWorld().setBlockState(at.east(),Blocks.AIR.getDefaultState());
        var task=CompletableFuture.runAsync(() -> {
            try { exercise(at); }catch(Exception e) {throw new CompletionException(e);}
        });
        ctx.runAtEveryTick(() -> {
            if(task.isDone()) {
                task.join();
                if(!ctx.getWorld().getBlockState(at).isAir()||!ctx.getWorld().getBlockState(at.east()).isAir()) throw new IllegalStateException("Undo did not restore world");
                ctx.complete();
            }
        });
    }
    private void exercise(BlockPos at) throws Exception {
        JsonObject config=JsonParser.parseString(Files.readString(FabricLoader.getInstance().getConfigDir().resolve("voxel-build.json"))).getAsJsonObject();
        HttpClient client=HttpClient.newHttpClient();
        String base="http://127.0.0.1:"+config.get("port").getAsInt(),auth="Bearer "+config.get("token").getAsString();
        record API(HttpClient client,String base,String auth) {
            JsonObject call(String route,Object data,boolean ok) throws Exception {
                var request=HttpRequest.newBuilder(URI.create(base+route)).header("Authorization",auth).header("Content-Type","application/json");
                if(data==null)request.GET();else request.POST(HttpRequest.BodyPublishers.ofString(JSON.toJson(data)));
                var response=client.send(request.build(),HttpResponse.BodyHandlers.ofString());
                if(ok!=(response.statusCode()==200))throw new IllegalStateException("Unexpected response "+route+": "+response.body());
                return JsonParser.parseString(response.body()).getAsJsonObject();
            }
            void complete(String id,String phase) throws Exception {
                for(int i=0;i<500;i++) {
                    JsonObject j=call("/job?id="+id,null,true);String p=j.get("phase").getAsString();
                    if(p.equals(phase))return;
                    if(Set.of("complete","rejected","rollback_conflict","rolled_back").contains(p))throw new IllegalStateException(j.toString());
                    Thread.sleep(20);
                }
                throw new IllegalStateException("Job timed out");
            }
        }
        var api=new API(client,base,auth);String world=api.call("/status",null,true).get("worldId").getAsString();
        var unauthorized=client.send(HttpRequest.newBuilder(URI.create(base+"/status")).GET().build(),HttpResponse.BodyHandlers.ofString());
        if(unauthorized.statusCode()!=403)throw new IllegalStateException("Missing authentication accepted");
        String stairs=api.call("/states",Map.of("states",List.of("minecraft:spruce_stairs[facing=east]")),true).getAsJsonArray("states").get(0).getAsString();
        if(!stairs.contains("facing=east")||!stairs.contains("waterlogged=false"))throw new IllegalStateException("States not canonicalized");
        api.call("/states",Map.of("states",List.of("minecraft:stone[imaginary=true]")),false);
        api.call("/states",Map.of("states",List.of("minecraft:chest")),false);
        List<Integer> p=List.of(at.getX(),at.getY(),at.getZ()),q=List.of(at.getX()+1,at.getY(),at.getZ());
        var first=Map.of("pos",p,"before","minecraft:air","after","minecraft:stone_bricks");
        var second=Map.of("pos",q,"before","minecraft:air","after",stairs);
        String id=UUID.randomUUID().toString();
        var transaction=Map.of("id",id,"worldId",world,"dimension","minecraft:overworld","changes",List.of(first,second));
        api.call("/apply",transaction,true);api.complete(id,"complete");api.call("/apply",transaction,true);
        var snap=api.call("/snapshot",Map.of("worldId",world,"dimension","minecraft:overworld","bounds",Map.of("min",p,"max",q)),true);
        if(snap.getAsJsonArray("blocks").size()!=2)throw new IllegalStateException("Snapshot differs from applied world");
        api.call("/apply",Map.of("id",id,"worldId",world,"dimension","minecraft:overworld","changes",List.of(first)),false);
        String conflict=UUID.randomUUID().toString();
        api.call("/apply",Map.of("id",conflict,"worldId",world,"dimension","minecraft:overworld","changes",List.of(first)),true);api.complete(conflict,"rejected");
        String undo=UUID.randomUUID().toString();
        api.call("/apply",Map.of("id",undo,"worldId",world,"dimension","minecraft:overworld","changes",List.of(Map.of("pos",p,"before","minecraft:stone_bricks","after","minecraft:air"),Map.of("pos",q,"before",stairs,"after","minecraft:air"))),true);api.complete(undo,"complete");
        snap=api.call("/snapshot",Map.of("worldId",world,"dimension","minecraft:overworld","bounds",Map.of("min",p,"max",q)),true);
        if(snap.getAsJsonArray("blocks").size()!=0)throw new IllegalStateException("Undo snapshot not empty");
    }
}
