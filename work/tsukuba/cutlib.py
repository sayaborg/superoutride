import numpy as np, cv2, sys
S='/tmp/claude-0/-home-claude/4053901e-89b9-5428-8587-851d0a595dcc/scratchpad/tsukuba/'
sys.path.insert(0,S)
from cut import *
def frame(t): return cv2.imread(S+f'v2/src/f_{t}.png')
def blue(bgr):
    hsv=cv2.cvtColor(bgr,cv2.COLOR_BGR2HSV); h,s,v=[hsv[...,i].astype(int) for i in range(3)]
    return (h>92)&(h<128)&(s>50)&(v>120)
def border_sky(bgr,inside,keep,cloud=False):
    sk=blue(bgr)
    if cloud:
        hsv=cv2.cvtColor(bgr,cv2.COLOR_BGR2HSV); b_,g_,r_=[bgr[...,i].astype(int) for i in range(3)]
        sk|=(hsv[...,1]<70)&(hsv[...,2]>165)&(b_>=r_-6)
    m=(sk&~(keep>0)).astype(np.uint8); pad=cv2.copyMakeBorder(m,1,1,1,1,cv2.BORDER_CONSTANT,value=1)
    out=cv2.copyMakeBorder((1-inside).astype(np.uint8),1,1,1,1,cv2.BORDER_CONSTANT,value=1)
    pad=np.maximum(pad,out)
    n,lab=cv2.connectedComponents(pad,connectivity=4); return (lab==lab[0,0])[1:-1,1:-1]
def cut(t,box,name,width,pts=None,keepblue=None,drop=None,cloud=False):
    x0,y0,x1,y1=box; c=frame(t)[y0:y1,x0:x1].copy(); inside=np.zeros(c.shape[:2],np.uint8)
    if pts is None: inside[:]=1
    else:
        for p in pts: cv2.fillPoly(inside,[np.array(p,np.int32)],1)
    kb=np.zeros_like(inside)
    for p in (keepblue or []): cv2.fillPoly(kb,[np.array(p,np.int32)],1)
    m=(inside>0)&~border_sky(c,inside,kb,cloud)
    for p in (drop or []):
        d=np.zeros_like(inside); cv2.fillPoly(d,[np.array(p,np.int32)],1); m&=~(d>0)
    m=cv2.morphologyEx(m.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    save_rgba(c,m,S+f'spr/{name}.png'); publish(name,c,m,width)
