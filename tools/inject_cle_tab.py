with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update wstabs
t1 = '...[["design","Design"],["print","3D Print Sim"],["simulate","Simulate"]]'
r1 = '...[["design","Design"],["print","3D Print Sim"],["simulate","Simulate"],["cle","CLE"]]'
assert t1 in text, "Target 1 not found"
text = text.replace(t1, r1, 1)
print("1. Injected CLE tab into wstabs.")

# 2. Update routing
t2 = 'm("Pose","",[{id:"sim-reset",label:"Reset pose",title:"Put moved parts back",icon:"clearSim",fn:()=>hi.resetPose()},{id:"sim-apply",label:"Apply pose",title:"Keep the moved positions in the design",icon:"move",fn:()=>hi.applyPose()}]),s.append(f("button",{class:"ibtn panel-toggle",style:{alignSelf:"center"},onclick:()=>a.classList.toggle("collapsed")},f("span",{class:"lbl"},"Browser")));return}'
r2 = t2 + 'if(Vr==="cle"){if(window.CLE&&window.CLE.renderAdvancedRibbon){window.CLE.renderAdvancedRibbon(m,s,n)}return}'
assert t2 in text, "Target 2 not found"
text = text.replace(t2, r2, 1)
print("2. Injected CLE ribbon router.")

# 3. Update script tag at bottom to use cle_bundle.js (standard script, no type="module")
t3 = '<script src="cle_tools/cle_boot.js" type="module"></script>'
r3 = '<script src="cle_tools/cle_bundle.js"></script>'
if t3 in text:
    text = text.replace(t3, r3, 1)
    print("3. Replaced module script with universal cle_bundle.js.")
elif r3 in text:
    print("3. cle_bundle.js already present.")
else:
    print("3. Script tag not found!")

with open(r'D:\CLEJS\Dev\index.htm', 'w', encoding='utf-8') as f:
    f.write(text)

print("Dev/index.htm updated successfully!")
