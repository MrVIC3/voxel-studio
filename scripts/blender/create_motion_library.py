"""Build the editable Blender scene and exported original motion library.

blender --background --factory-startup --python-exit-code 2 \
  --python scripts/blender/create_motion_library.py -- SOURCE.blend MOTION.glb
"""

from pathlib import Path
import sys
from math import radians, cos, sin, pi, sqrt

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake_motion import export_motion

FPS = 24
AS_BLENDER = Matrix.Rotation(pi / 2, 4, "X").to_quaternion()


def world(value):
    return AS_BLENDER @ Vector(value)


def angles(value):
    # Voxel Studio uses intrinsic XYZ (Three); mathutils Euler applies axes in the other order.
    q = value if isinstance(value, Quaternion) else local_rotation(value)
    return AS_BLENDER @ q @ AS_BLENDER.inverted()


def local_rotation(value):
    return Quaternion((1, 0, 0), radians(value[0])) @ Quaternion((0, 1, 0), radians(value[1])) @ Quaternion((0, 0, 1), radians(value[2]))


def material(name, rgb):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*rgb, 1)
    return result


def cube_mesh(geometry, center, size, slot):
    x, y, z = center
    w, h, d = (n / 2 for n in size)
    offset = len(geometry[0])
    geometry[0].extend(world((x + i*w, y + j*h, z + k*d)) for i,j,k in [
        (-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
        (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)
    ])
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
    geometry[1].extend(tuple(offset + index for index in face) for face in faces)
    geometry[2].extend([slot] * 6)
    return list(range(offset, offset+8))


def build_mesh(name, geometry, materials, arm, bone):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(geometry[0], [], geometry[1])
    for mat in materials:
        mesh.materials.append(mat)
    for polygon, index in zip(mesh.polygons, geometry[2]):
        polygon.material_index = index
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = Matrix.Identity(4)
    return obj


def make_rig():
    armature = bpy.data.armatures.new("Voxel humanoid · 14 joints")
    arm = bpy.data.objects.new("VoxelRoot", armature)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    arm.show_in_front = True
    armature.display_type = "STICK"
    bpy.ops.object.mode_set(mode="EDIT")
    joints = {
        "body": ((0, .75, 0), None),
        "head": ((0, 1.50, 0), "body"),
    }
    for side, sign in [("left", 1), ("right", -1)]:
        joints[f"{side}Arm"] = ((sign*.375, 1.50, 0), "body")
        joints[f"{side}Forearm"] = ((sign*.375, 1.125, 0), f"{side}Arm")
        joints[f"{side}Hand"] = ((sign*.375, .75, 0), f"{side}Forearm")
        joints[f"{side}Leg"] = ((sign*.125, .75, 0), "body")
        joints[f"{side}Shin"] = ((sign*.125, .375, 0), f"{side}Leg")
        joints[f"{side}Foot"] = ((sign*.125, 0, 0), f"{side}Shin")
    for name, (pivot, parent) in joints.items():
        joint = armature.edit_bones.new(name)
        joint.head = world(pivot)
        joint.tail = world((pivot[0], pivot[1]+.20, pivot[2]))
        if parent:
            joint.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.rotation_mode = "QUATERNION"
    for bone in arm.pose.bones:
        bone.rotation_mode = "QUATERNION"
    palette = [
        material("Slate wool", (.09,.14,.17)), material("Copper trim", (.61,.21,.08)),
        material("Skin", (.68,.39,.23)), material("Ink", (.027,.023,.021)),
        material("Eye whites", (.98,.96,.87)), material("Iris teal", (.10,.50,.49)),
    ]
    pieces = {
        "body": ((0,1.125,0),(.50,.75,.25),0),
        "head": ((0,1.75,0),(.50,.50,.50),2),
    }
    for side, sign in [("left",1),("right",-1)]:
        for part, y, slot in [("Arm",1.3125,0),("Forearm",.9375,2),("Leg",.5625,0),("Shin",.1875,0)]:
            pieces[f"{side}{part}"] = ((sign*(.375 if part in ["Arm","Forearm"] else .125),y,0),(.245,.369,.245),slot)
    for bone, (center,size,slot) in pieces.items():
        g=([],[],[])
        cube_mesh(g,center,size,slot)
        if bone=="head":
            cube_mesh(g,(0,1.9725,-.025),(.509,.063,.451),3)
            cube_mesh(g,(0,1.850,-.233),(.501,.181,.042),3)
        if bone=="body":
            cube_mesh(g,(0,.820,.129),(.494,.075,.012),1)
        build_mesh("Puppet · "+bone,g,palette,arm,bone)
    face = ([],[],[])
    eyes, pupils, brows = [], [], []
    for side in [-1,1]:
        eyes.extend(cube_mesh(face,(side*.108,1.795,.251),(.132,.073,.012),4))
        pupils.extend(cube_mesh(face,(side*.108,1.795,.260),(.044,.057,.008),5))
        brows.extend(cube_mesh(face,(side*.108,1.860,.256),(.123,.017,.012),3))
    mouth = cube_mesh(face,(0,1.660,.255),(.125,.025,.014),3)
    feature = build_mesh("Face · expression shapes",face,palette,arm,"head")
    feature.shape_key_add(name="Basis")
    shapes = {}
    for name in ["LookX","LookY","Blink","Brow","Smile","Jaw"]:
        shape = feature.shape_key_add(name="Voxel"+name)
        shape.slider_min = 0 if name in ["Blink","Jaw"] else -1
        shape.slider_max = 1
        shapes[name] = shape
    for index in pupils:
        shapes["LookX"].data[index].co += world((.038,0,0))
        shapes["LookY"].data[index].co += world((0,.014,0))
    for index in eyes+pupils:
        pos = AS_BLENDER.inverted() @ face[0][index]
        shapes["Blink"].data[index].co += world((0,(1.795-pos.y)*.94,0))
    for index in brows:
        shapes["Brow"].data[index].co += world((0,.044,0))
    for index in mouth:
        pos = AS_BLENDER.inverted() @ face[0][index]
        shapes["Smile"].data[index].co += world((pos.x*.19,.022 if abs(pos.x)>.05 else .004,0))
        shapes["Jaw"].data[index].co += world((0,-.065 if pos.y<1.66 else .003,0))
    return arm, feature, shapes


def pose(**channels):
    return channels


def plant(values, feet):
    """Solve each leg against an ankle target in root-local space."""
    down = Vector((0, -1, 0))
    pelvis = Vector(values.get("body_pos", (0, 0, 0))) + Vector((0, .75, 0))
    body = local_rotation(values.get("body", (0, 0, 0)))
    result = dict(values)
    segment = .375
    for side, sign in [("left", 1), ("right", -1)]:
        hip = Vector((sign * .125, 0, 0))
        target = body.inverted() @ (Vector(feet[side]) - pelvis) - hip
        direction = target.normalized()
        reach = min(.7495, max(.03, target.length))
        knee_pole = body.inverted() @ Vector((0, 0, 1))
        bend = (knee_pole - direction * direction.dot(knee_pole)).normalized()
        knee = direction * (reach / 2) + bend * sqrt(segment**2 - (reach / 2)**2)
        upper = down.rotation_difference(knee.normalized())
        shin = down.rotation_difference(upper.inverted() @ (direction * reach - knee).normalized())
        result[side + "Leg"] = upper
        result[side + "Shin"] = shin
        result[side + "Foot"] = (body @ upper @ shin).inverted()
    return result


def stationary(keys, stance=.125):
    return [(frame, plant(values, {"left": (stance, 0, .075), "right": (-stance, 0, -.055)}))
            for frame, values in keys]


def smooth_inbetweens(keys):
    """Sample large changes in the torso before solving planted legs."""
    result = []
    for (start, a), (end, b) in zip(keys, keys[1:]):
        for frame in range(start, end):
            t = (frame - start) / (end - start)
            t = t * t * (3 - 2 * t)
            values = {}
            for channel in a.keys() | b.keys():
                if channel == "face":
                    first, last = a.get(channel, {}), b.get(channel, {})
                    values[channel] = {name: (1-t)*first.get(name,0) + t*last.get(name,0)
                                       for name in first.keys() | last.keys()}
                else:
                    first, last = a.get(channel, (0,0,0)), b.get(channel, (0,0,0))
                    values[channel] = tuple((1-t)*x + t*y for x,y in zip(first,last))
            result.append((frame, values))
    return result + [keys[-1]]


def planted_step(keys, distance, foot_steps):
    result = []
    for frame, values in keys:
        root = Vector(values.get("root_pos", (0, 0, 0)))
        feet = {}
        for side, sign, start, finish in foot_steps:
            t = min(1, max(0, (frame - start) / (finish - start)))
            stride = distance * t * t * (3 - 2 * t)
            feet[side] = Vector((sign * .155, .115 * sin(pi * t)**2, sign * .085 + stride)) - root
        hips = values.get("body_pos", (0, 0, 0))
        result.append((frame, plant({**values,"body_pos": (hips[0], min(-.06,hips[1]), hips[2])}, feet)))
    return result


def gait(frames, distance, duty, clearance, hips, mode):
    keys = []
    for i in range(frames + 1):
        phase = (i % frames) / frames
        wave = phase * 2 * pi
        feet = {}
        for side, shift, sign in [("left", 0, 1), ("right", .5, -1)]:
            step = (phase + shift) % 1
            swing = max(0, (step - duty) / (1 - duty))
            # World contact stays fixed through stance. Swing eases between contacts.
            advance = swing * swing * (3 - 2 * swing)
            arc = sin(pi * swing)
            lift = clearance * arc**2
            feet[side] = (sign * .132, lift,
                          distance * (duty / 2 - step + advance))
        arm = {"walk": 23, "stealth": 9}[mode]
        lean = {"walk": 5, "stealth": 20}[mode]
        elbow = {"walk": -14, "stealth": -58}[mode]
        bob = .012 * (1 - cos(wave * 2))
        pump = cos(wave)
        values = pose(root_pos=(0, 0, distance * i / frames), body_pos=(0, hips + bob - .75, 0),
                      body=(lean, 5 * sin(wave), 2 * cos(wave)),
                      head=(-lean * .75, -4 * sin(wave), -1.4 * cos(wave)),
                      leftArm=(arm * pump, 1, 7), rightArm=(-arm * pump, -1, -7),
                      leftForearm=(elbow - 12 * pump, 0, 2), rightForearm=(elbow + 12 * pump, 0, -2),
                      face={"LookY": .10, "Brow": -.35 if mode == "stealth" else -.12})
        keys.append((i + 1, plant(values, feet)))
    return keys


def sprint():
    """One full sprint stride, authored as contact, drive, flight and recovery."""
    stride = 2.32
    # The first five samples hold one world-space contact. The heel then folds
    # toward the hips, the thigh drives through, and the foot reaches for landing.
    foot_y = [0,0,0,0,0,.14,.32,.44,.50,.49,.46,.41,.34,.28,.23,.105]
    foot_z = [.29-stride*i/16 for i in range(5)] + [-.49,-.49,-.37,-.18,.03,.23,.40,.48,.49,.46,.39]
    pelvis_y = [.679,.655,.651,.666,.685,.741,.789,.767]
    keys = []
    for i in range(17):
        left, right = i % 16, (i+8) % 16
        wave = left*pi/8
        height = pelvis_y[i%8]
        feet = {"left": (.118,foot_y[left],foot_z[left]),
                "right": (-.118,foot_y[right],foot_z[right])}
        # Vertical travel belongs to the pelvis so a separately authored route
        # or an in-place loop still retains the airborne silhouette.
        values = pose(root_pos=(0,0,stride*i/16),body_pos=(0,height-.75,0),
                      body=(21+2*cos(wave*2),7*sin(wave+.3),2*cos(wave)),
                      head=(-17,-5*sin(wave+.3),-1.7*cos(wave)),
                      leftArm=(44*cos(wave)-12,0,3),rightArm=(-44*cos(wave)-12,0,-3),
                      leftForearm=(-10+5*cos(wave-.52),0,0),
                      rightForearm=(-10-5*cos(wave-.52),0,0),
                      face={"Brow":-.48,"LookY":.08,"Jaw":.08+.07*(1+cos(wave*2))})
        keys.append((i+1,plant(values,feet)))
    return keys


def make_actions():
    idle = pose(leftArm=(2,0,4),rightArm=(-2,0,-4),leftForearm=(-7,0,0),rightForearm=(-5,0,0))
    breath = {**idle,"body":(-2,0,-1),"head":(1,1,0),"body_pos":(0,.017,0),"face":{"LookY":.08}}
    breathe = [(1,idle),(22,breath),(30,breath),(32,{**breath,"face":{"Blink":1,"LookY":.08}}),
               (35,breath),(53,idle),(76,breath),(97,idle)]
    walk = gait(24, 1.08, .59, .13, .665, "walk")
    run = sprint()
    creep = gait(32, .79, .69, .082, .53, "stealth")
    crouch = pose(body=(28,0,1),body_pos=(0,-.20,.06),head=(-17,2,0),
        leftLeg=(-47,0,3),rightLeg=(-42,0,-4),leftShin=(79,0,0),rightShin=(76,0,0),
        leftFoot=(-31,0,0),rightFoot=(-33,0,0),leftArm=(-37,0,10),rightArm=(-40,0,-12),
        leftForearm=(-28,0,0),rightForearm=(-29,0,0),face={"Brow":-.20})
    hover = pose(root_pos=(0,.72,.32),body=(-8,7,-5),head=(8,-5,2),
        leftLeg=(-55,0,5),rightLeg=(-24,0,-6),leftShin=(58,0,0),rightShin=(71,0,0),
        leftArm=(-142,-7,18),rightArm=(-128,5,-19),leftForearm=(-32,0,0),rightForearm=(-36,0,0),
        face={"Brow":.65,"Jaw":.32,"LookY":-.20})
    landing = {**crouch,"root_pos":(0,0,.76),"face":{"Blink":.68,"Brow":-.32,"Jaw":.18}}
    jump = [(1,idle),(10,stationary([(10,crouch)])[0][1]),(16,{**hover,"root_pos":(0,.29,.13)}),(23,hover),
            (31,{**hover,"root_pos":(0,.35,.60),"leftLeg":(-21,0,7),"rightLeg":(-31,0,-8)}),
            (38,stationary([(38,landing)],.15)[0][1]),
            (40,stationary([(40,{**landing,"face":{"Blink":.26,"Brow":-.32,"Jaw":.18}})],.15)[0][1]),
            (45,stationary([(45,{**landing,"body_pos":(0,-.13,.03),"face":{"Brow":-.19}})],.15)[0][1]),
            (62,{**idle,"root_pos":(0,0,.76)})]
    look_right = {**idle,"body":(3,-19,5),"head":(-5,-41,9),"rightArm":(7,0,-11),
                  "face":{"LookX":-.72,"LookY":.18,"Brow":.28,"Blink":.08}}
    look_left = {**idle,"body":(3,17,-6),"head":(-6,43,-9),"leftArm":(7,0,11),
                 "face":{"LookX":.73,"LookY":.16,"Brow":.33}}
    scan = [(1,idle),(8,idle),(11,{**idle,"face":{"LookX":-.8}}),(23,look_right),(37,look_right),
            (39,{**look_right,"face":{"LookX":-.65,"Blink":1}}),(42,{**look_right,"face":{"LookX":.8}}),
            (49,{**idle,"body":(2,-8,2),"head":(-4,13,1),"face":{"LookX":.9}}),
            (58,look_left),(72,{**look_left,"head":(-5,38,-6)}),(89,idle)]
    salute = pose(body=(-5,-7,5),head=(-6,10,-8),rightArm=(-96,-9,-40),
        rightForearm=(-41,0,-18),rightHand=(11,-7,16),leftArm=(10,0,7),
        face={"Smile":.66,"Brow":.38,"LookX":-.12})
    wave = [(1,idle),(10,{**idle,"head":(-2,8,-8),"face":{"Smile":.27}}),(24,salute),
            (30,{**salute,"rightForearm":(-41,0,-30),"rightHand":(11,-7,-21)}),
            (36,salute),(42,{**salute,"rightForearm":(-41,0,-28),"rightHand":(11,-7,-20)}),
            (47,salute),(49,{**salute,"face":{"Smile":.72,"Blink":.88}}),
            (52,{**salute,"face":{"Smile":.72}}),(58,{**idle,"rightArm":(-33,0,-12),"face":{"Smile":.48}}),(69,idle)]
    guard = pose(body=(9,-21,-6),body_pos=(0,-.04,0),head=(-5,20,3),rightArm=(-51,9,-14),
        rightForearm=(-51,-11,-10),rightHand=(3,-15,16),leftArm=(-43,8,26),
        leftForearm=(-44,0,4),leftLeg=(-17,0,11),rightLeg=(17,0,-8),leftShin=(31,0,0),
        rightShin=(13,0,0),face={"Brow":-.46,"LookY":.19})
    windup = {**guard,"body":(5,-43,-14),"head":(-4,37,7),"rightArm":(-142,-27,-31),
        "rightForearm":(-65,0,-17),"rightHand":(21,-36,19),"face":{"Brow":-.65,"LookX":.2}}
    hit = {**guard,"root_pos":(0,0,.25),"body":(23,49,13),"head":(-15,-34,-8),
        "rightArm":(-53,30,40),"rightForearm":(-12,0,16),"leftArm":(24,0,13),
        "leftLeg":(-31,0,8),"rightLeg":(23,0,-13),"leftShin":(48,0,0),
        "face":{"Brow":-.76,"Jaw":.43,"Blink":.2}}
    slash = [(1,guard),(9,windup),(14,{**windup,"body":(7,-50,-12)}),
             (17,{**hit,"root_pos":(0,0,.13),"body":(15,14,5),"rightArm":(-105,5,10),
                  "rightForearm":(-24,-5,5),"face":{"Brow":-.78,"Jaw":.21}}),(19,hit),
             (27,{**hit,"body":(18,29,10),"rightHand":(4,22,-7)}),(44,{**guard,"root_pos":(0,0,.25)})]
    flinch = {**guard,"root_pos":(0,.04,-.19),"body":(-24,9,-12),"head":(-9,-17,13),
              "rightArm":(-99,-21,-35),"leftArm":(-115,9,31),
              "face":{"Blink":.91,"Jaw":.49,"Brow":.57}}
    recoil = [(1,idle),(6,idle),(9,{**idle,"body":(-9,3,-5),"face":{"Brow":.9,"Jaw":.55,"LookY":.2}}),(12,flinch),
              (16,{**flinch,"root_pos":(0,.018,-.27),"face":{"Brow":.65,"Jaw":.4,"Blink":.16}}),
              (20,{**flinch,"root_pos":(0,0,-.32),"head":(2,-9,7),"face":{"Brow":.35,"Jaw":.23}}),
              (41,{**guard,"root_pos":(0,0,-.32)})]
    triumph = pose(body=(-10,2,0),head=(-16,0,-3),leftArm=(-152,-12,25),rightArm=(-151,12,-28),
         leftForearm=(-49,-6,-12),rightForearm=(-47,5,13),leftHand=(16,2,0),rightHand=(18,-5,0),
         face={"Smile":.92,"Jaw":.63,"Brow":.5,"LookY":.18})
    victory = stationary([(1,idle),(8,{**crouch,"body_pos":(0,-.12,0),"face":{"Smile":.44}})]) + [
               (19,{**triumph,"root_pos":(0,.17,0),"leftLeg":(-17,0,7),"rightLeg":(-7,0,-6),
                    "leftShin":(24,0,0),"rightShin":(18,0,0)})] + stationary([
               (25,{**triumph,"body_pos":(0,-.10,0)}),(31,triumph),(42,{**triumph,"head":(-5,9,8),
               "face":{"Smile":1,"Jaw":.14,"Brow":.35}}),(61,{**idle,"face":{"Smile":.65}}),(81,idle)]
    )
    peek = [(1,idle),(10,{**idle,"face":{"LookX":.85,"Brow":.33}}),
        (24,{**look_left,"body_pos":(.105,-.025,.03),"head":(-8,29,-19),
             "face":{"LookX":.7,"Brow":.52,"Smile":.18}}),
        (44,{**look_left,"body_pos":(.12,-.04,.05),"head":(4,34,-12),"face":{"LookX":.6,"LookY":-.3,"Brow":.1}}),
        (46,{**look_left,"body_pos":(.12,-.04,.05),"head":(4,34,-12),"face":{"LookX":.6,"LookY":-.3}}),
        (48,{**look_left,"body_pos":(.11,-.04,.05),"head":(3,33,-12),"face":{"LookX":.6,"Blink":.95}}),
        (51,{**look_left,"body_pos":(.10,-.04,.05),"head":(3,29,-10),"face":{"LookX":.52}}),(66,idle)]
    talk = []
    for i in range(17):
        stress = i in [1, 4, 7, 10, 14]
        energy = 0 if i in [0, 5, 11, 16] else (1 if stress else .43)
        talk.append((1+i*5,{**idle,"head":(-7*energy, 4*sin(i*.9), 5*sin(i*.5)),
            "body":(3*energy,3*sin(i*.43),0),"rightArm":(-34*energy,0,-11*energy),
            "rightForearm":(-49*energy,0,-4),"face":{"Jaw":(.75 if stress else .25)*energy,
            "Brow":.5*energy,"Smile":.52*energy,"LookX":.25*sin(i*.7)}}))
        if i in [5, 11]:
            values = talk[-1][1]
            talk.extend([(2+i*5,{**values,"face":{**values["face"],"Blink":1}}),(4+i*5,values)])
    talk[-1] = (81,idle)
    stand = [(1,crouch),(14,{**crouch,"head":(-6,-15,7),"face":{"LookX":-.72,"Brow":.14}}),
        (30,{**crouch,"body_pos":(0,-.12,.05),"leftShin":(53,0,0),"rightShin":(57,0,0),
             "leftLeg":(-32,0,4),"rightLeg":(-33,0,-4),"head":(-9,-6,3)}),
        (43,{**idle,"body":(-9,0,0),"head":(2,4,0)}),
        (46,{**idle,"body":(-7,0,0),"head":(2,4,0),"face":{"Blink":.84}}),
        (49,{**idle,"body":(-6,0,0),"head":(2,4,0)}),(60,idle)]
    listen = [(1,idle),(10,{**idle,"head":(-3,8,-6),"face":{"LookX":.38,"Brow":.27}}),
        (23,{**idle,"body":(2,4,-2),"head":(3,8,-6),"face":{"LookX":.31,"Brow":.28}}),
        (27,{**idle,"head":(12,7,-6),"face":{"LookX":.29}}),
        (33,{**idle,"head":(-1,8,-5),"face":{"LookX":.34,"Brow":.21}}),
        (46,{**idle,"head":(-1,7,-4),"face":{"LookX":.3}}),
        (48,{**idle,"head":(-1,7,-4),"face":{"LookX":.3,"Blink":.95}}),
        (51,{**idle,"head":(-1,7,-4),"face":{"LookX":.3}}),(73,idle)]
    nod = [(1,idle),(6,{**idle,"head":(-8,0,0),"face":{"Brow":.31}}),
        (11,{**idle,"head":(21,1,0),"face":{"Smile":.17,"Blink":.24}}),
        (17,{**idle,"head":(-4,0,1),"face":{"Smile":.27}}),
        (22,{**idle,"head":(10,0,0),"face":{"Smile":.21}}),(33,idle)]
    disagree = [(1,idle),(6,{**idle,"head":(-5,0,0),"face":{"Brow":-.35}}),
        (11,{**idle,"head":(-4,26,5),"face":{"LookX":.25,"Brow":-.5}}),
        (18,{**idle,"head":(-3,-28,-5),"face":{"LookX":-.23,"Brow":-.5}}),
        (24,{**idle,"head":(-3,19,3),"face":{"LookX":.18,"Brow":-.38}}),(38,idle)]
    point = {**idle,"body":(5,-11,-2),"head":(-3,9,0),"rightArm":(-86,6,-8),
        "rightForearm":(-8,0,0),"rightHand":(-5,0,0),"face":{"LookX":.12,"Brow":-.45,"Jaw":.16}}
    point_forward = [(1,idle),(8,{**idle,"head":(-4,11,0),"face":{"LookX":.56}}),
        (17,point),(32,{**point,"head":(-1,6,0),"face":{"LookX":.04,"Brow":-.16}}),
        (39,{**idle,"rightArm":(-39,0,-5),"rightForearm":(-22,0,0)}),(52,idle)]
    ready = {**guard,"body":(10,-14,-4),"body_pos":(0,-.11,0),"rightArm":(-48,7,-17),
        "leftArm":(-30,6,19),"face":{"Brow":-.47,"LookY":.08}}
    guard_loop = [(1,ready),(17,{**ready,"body_pos":(-.017,-.10,0),"head":(-6,22,3)}),
        (30,{**ready,"body_pos":(.015,-.118,0),"rightForearm":(-56,-11,-8)}),
        (42,ready),(44,{**ready,"face":{"Brow":-.47,"Blink":1}}),(47,ready),(65,ready)]
    reach = {**crouch,"body":(47,-9,-6),"body_pos":(0,-.24,.12),"head":(-5,4,0),
        "rightArm":(-23,0,-8),"rightForearm":(-7,0,-4),"leftArm":(22,0,8),"leftForearm":(-20,0,0),
        "face":{"LookY":-.75,"Brow":-.26}}
    carry = {**idle,"rightArm":(-30,0,-7),"rightForearm":(-63,0,0),"rightHand":(9,0,0),
        "head":(6,-6,0),"face":{"LookY":-.38,"Brow":.26}}
    pick_up = [(1,idle),(8,{**idle,"head":(23,-6,0),"face":{"LookY":-.69}}),
        (23,reach),(28,{**reach,"rightHand":(-11,0,0)}),(43,carry),(61,carry)]
    def sidestep():
        keys = []
        for i in range(33):
            t = i / 32
            x = .62 * (t*t*(3-2*t))
            feet = {}
            for side, origin, start, finish in [("left",.13,.08,.51),("right",-.13,.47,.92)]:
                s = min(1,max(0,(t-start)/(finish-start)))
                feet[side] = (origin + .62*s*s*(3-2*s)-x,.13*sin(pi*s)**2,0)
            values = {**ready,"root_pos":(x,0,0),"body_pos":(0,-.12-.03*sin(pi*t),0),
                      "body":(9,-8,-9*sin(2*pi*t)), "head":(-4,14,3*sin(2*pi*t))}
            keys.append((i+1,plant(values,feet)))
        return keys
    def turn():
        keys = []
        for i in range(37):
            t = i / 36
            s = min(1,max(0,(t-.15)/.65))
            yaw = 90*s*s*(3-2*s)
            rotation = local_rotation((0,yaw,0))
            feet = {}
            for side, sign, start, finish in [("left",1,.12,.49),("right",-1,.46,.88)]:
                f = min(1,max(0,(t-start)/(finish-start)))
                start_point = Vector((sign*.15,0,0))
                end_point = Vector((0,0,-sign*.15))
                target = start_point.lerp(end_point,f*f*(3-2*f))
                target.y = .10*sin(pi*f)**2
                feet[side] = rotation.inverted() @ target
            values = {**idle,"root_turn":(0,yaw,0),"body_pos":(0,-.055,0),
                      "body":(4,12*sin(pi*s),-4*sin(2*pi*s)),
                      "head":(-2,24*sin(pi*min(1,t*1.4)),0),"face":{"LookX":.8*sin(pi*t),"Brow":.16*sin(pi*t)}}
            keys.append((i+1,plant(values,feet)))
        return keys
    return [
        ("01 · Idle Breath", stationary(breathe)), ("02 · Cinematic Walk", walk),
        ("03 · Driven Run", run), ("04 · Stealth Walk", creep),
        ("05 · Alert Scan", stationary(scan)), ("06 · Curious Peek", stationary(peek)),
        ("07 · Friendly Wave", stationary(wave)), ("08 · Lively Dialogue", stationary(talk)),
        ("09 · Vault and Land", jump),
        ("10 · Heavy Blade Strike", planted_step(slash,.25,[("left",1,14,19),("right",-1,28,43)])),
        ("11 · Sudden Recoil", planted_step(recoil,-.32,[("right",-1,9,13),("left",1,13,22)])),
        ("12 · Victory Cheer", victory),
        ("13 · Crouch to Stand", stationary(stand,.15)),
        ("14 · Attentive Listening", stationary(listen)),
        ("15 · Affirmative Nod", stationary(nod)), ("16 · Head Shake", stationary(disagree)),
        ("17 · Point Ahead", stationary(point_forward)), ("18 · Guard Stance Loop", stationary(guard_loop,.19)),
        ("19 · Pick Up and Inspect", stationary(smooth_inbetweens(pick_up),.15)), ("20 · Guarded Sidestep", sidestep()),
        ("21 · Quarter Turn Left", turn()),
    ]


def nla(data, action, name, end):
    slot = getattr(data, "action_slot", None)
    track = data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    if slot and hasattr(strip, "action_slot"):
        strip.action_slot = slot
    strip.blend_type = "REPLACE"
    strip.extrapolation = "NOTHING"
    strip.action_frame_start = 1
    strip.action_frame_end = end
    data.action = None
    return track


def author(arm, face, shapes):
    anim = arm.animation_data_create()
    face_data = face.data.shape_keys.animation_data_create()
    for name, keys in make_actions():
        body_action = bpy.data.actions.new(name + " · Body")
        eye_action = bpy.data.actions.new(name + " · Face")
        body_action.use_fake_user = True
        eye_action.use_fake_user = True
        anim.action = body_action
        face_data.action = eye_action
        previous = {}
        def continuous(channel, rotation):
            if channel in previous and previous[channel].dot(rotation) < 0:
                rotation.negate()
            previous[channel] = rotation.copy()
            return rotation
        for frame, values in keys:
            arm.location = world(values.get("root_pos",(0,0,0)))
            arm.rotation_quaternion = continuous("root", angles(values.get("root_turn",(0,0,0))))
            arm.keyframe_insert("location", frame=frame, group="Root motion")
            arm.keyframe_insert("rotation_quaternion", frame=frame, group="Root motion")
            for joint in arm.pose.bones:
                basis = joint.bone.matrix_local.to_quaternion()
                joint.rotation_quaternion = continuous(joint.name,
                    basis.inverted() @ angles(values.get(joint.name,(0,0,0))) @ basis)
                joint.location = basis.inverted() @ world(values.get(joint.name+"_pos",(0,0,0)))
                joint.keyframe_insert("rotation_quaternion",frame=frame,group=joint.name)
                if joint.name=="body":
                    joint.keyframe_insert("location",frame=frame,group=joint.name)
            for channel, shape in shapes.items():
                shape.value = values.get("face",{}).get(channel,0)
                shape.keyframe_insert("value",frame=frame,group="Expression")
        nla(anim,body_action,name,keys[-1][0])
        nla(face_data,eye_action,name,keys[-1][0])
    return anim, face_data


def main():
    args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if len(args) != 2:
        raise ValueError("Provide output .blend and .glb paths after --.")
    source, output = (Path(a).resolve() for a in args)
    source.parent.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.name = "Voxel Studio · Original Motion Library"
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, 97
    scene["voxel_motion_library"] = True
    arm, face, shapes = make_rig()
    animations = author(arm, face, shapes)
    scene.frame_set(1)
    export_motion(output, "NLA_TRACKS")
    for data in animations:
        for track in data.nla_tracks:
            track.mute = not track.name.startswith("01")
    scene.frame_set(1)
    bpy.context.view_layer.objects.active = arm
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.color_type = "MATERIAL"
                area.spaces.active.region_3d.view_location = (0,0,1.0)
                area.spaces.active.region_3d.view_rotation = Quaternion((.894,.395,.061,.199)).normalized()
                area.spaces.active.region_3d.view_distance = 4
    bpy.ops.wm.save_as_mainfile(filepath=str(source))


if __name__ == "__main__":
    main()
