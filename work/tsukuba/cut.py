import numpy as np, cv2, sys
def save_rgba(bgr,mask,path,preview=True):
    rgba=np.dstack([bgr,(mask>0).astype(np.uint8)*255]); cv2.imwrite(path,rgba)
    if preview:
        bg=np.zeros_like(bgr); bg[:]=(255,0,255); m=(mask>0)[...,None]
        cv2.imwrite(path.replace('.png','_prev.png'),np.where(m,bgr,bg))
def largest(mask):
    n,lab,st,_=cv2.connectedComponentsWithStats(mask.astype(np.uint8),connectivity=8)
    if n<2: return mask
    k=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); return (lab==k).astype(np.uint8)
def sky_mask(bgr):
    b,g,r=[bgr[...,i].astype(int) for i in range(3)]
    hsv=cv2.cvtColor(bgr,cv2.COLOR_BGR2HSV); h,s,v=[hsv[...,i].astype(int) for i in range(3)]
    blue=(h>95)&(h<125)&(s>70)&(v>120)
    cloud=(s<70)&(v>200)&(b>=r)       # white with a blue cast
    return blue|cloud

import json, subprocess, os
REPO='/home/claude/superoutride'
def publish(name,bgr,mask,width_m,anchor=None):
    """Write the source PNG and recipe, then import it as a course image."""
    os.makedirs(REPO+'/content/sprite-sources',exist_ok=True)
    h,w=mask.shape; rgba=np.dstack([bgr,(mask>0).astype(np.uint8)*255])
    cv2.imwrite(f'{REPO}/content/sprite-sources/{name}.png',rgba)
    ax,ay=anchor if anchor else ((w-1)/2,h-1)
    rec={'format':'superoutride.sprite-recipe','version':1,'target':'course','crop':{'x':0,'y':0,'width':w,'height':h},
         'widthMeters':width_m,'anchor':{'x':ax,'y':ay},'mask':[],'palette':None,'lamp':{'rectangles':[],'colors':[]}}
    json.dump(rec,open(f'{REPO}/content/sprite-sources/{name}.json','w'),indent=2)
    r=subprocess.run(['npm','run','-s','sprite','--','import',name],cwd=REPO,capture_output=True,text=True)
    print(name,(r.stdout+r.stderr)[:300])
