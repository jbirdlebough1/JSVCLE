with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

target = 'm("Pose","",[{id:"sim-reset",label:"Reset pose",title:"Put moved parts back",icon:"clearSim",fn:()=>hi.resetPose()},{id:"sim-apply",label:"Apply pose",title:"Keep the moved positions in the design",icon:"move",fn:()=>hi.applyPose()}]),s.append(f("button",{class:"ibtn panel-toggle",style:{alignSelf:"center"},onclick:()=>a.classList.toggle("collapsed")},f("span",{class:"lbl"},"Browser")));return}'
idx = text.find(target)
print("simulate end found:", idx != -1)
