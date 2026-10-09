import numpy as np, cv2, json, sys
from PIL import Image
S='/tmp/claude-0/-home-claude/4053901e-89b9-5428-8587-851d0a595dcc/scratchpad/tsukuba/'
W,H,HZ=1504,640,320
def skyof(t,rows):
    f=cv2.imread(S+f'v3/src/f_{t}.png'); sky=f[0:rows].copy()
    v=cv2.cvtColor(sky,cv2.COLOR_BGR2GRAY)
    bh=cv2.morphologyEx(v,cv2.MORPH_BLACKHAT,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(25,25)))
    dark=(bh>10).astype(np.uint8); dark[:rows-300]=0
    dark=cv2.dilate(dark,np.ones((7,7),np.uint8)); sky=cv2.inpaint(sky,dark,9,cv2.INPAINT_TELEA)
    out=cv2.resize(sky,(W//2+160,int(rows*(W/2+160)/1920)),interpolation=cv2.INTER_AREA).astype(np.float32)
    return out
A=skyof('46.5',400); B=skyof('50.5',400); ph=min(A.shape[0],B.shape[0]); A=A[-ph:]; B=B[-ph:]
B*= (A.mean(axis=(0,1))/B.mean(axis=(0,1)))
pan=np.zeros((ph,W,3),np.float32); wgt=np.zeros((1,W,1),np.float32)
def put(src,x0):
    w=src.shape[1]; ramp=np.minimum(np.minimum(np.arange(w)+1,w-np.arange(w)),160)/160.0
    for i in range(w):
        x=(x0+i)%W; pan[:,x]+=src[:,i]*ramp[i]; wgt[0,x,0]+=ramp[i]
put(A,0); put(B,W//2)
pan/=wgt
img=np.zeros((H,W,3),np.float32)
img[HZ-ph:HZ]=pan
top=pan[0:3].mean(axis=(0,1)); deep=top*np.array([0.82,0.72,0.55])   # BGR: deeper blue upward
for y in range(HZ-ph):
    t=1-y/(HZ-ph); img[y]=top*(1-t)+deep*t
# soften the join
for k in range(12): img[HZ-ph+k]=img[HZ-ph+k]*(k/12)+ (top)*(1-k/12)
import math
MT=int(sys.argv[2]) if len(sys.argv)>2 else 400
mc=np.array([178,150,120],np.float32)     # haze blue-grey sampled from the 2021 recording's mountain (BGR)
for x in range(-70,71):
    hgt_=9.0*math.exp(-((x+9)/22)**2)+8.0*math.exp(-((x-12)/20)**2)+2.5*math.exp(-(x/55)**2)
    img[HZ-int(round(hgt_)):HZ,(MT+x)%W]=mc
# tree line and ground
tl=np.array([40,62,48],np.float32); rng=np.random.default_rng(3); hgt=np.clip(np.convolve(rng.normal(4,1.5,W),np.ones(9)/9,'same'),2,7).astype(int)
for x in range(W): img[HZ-hgt[x]:HZ,x]=tl*(0.9+0.2*((x//2)%2))
img[HZ:]=np.array([64,152,104],np.float32)   # the verge's green
img[HZ:HZ+2]=tl
rgb=np.clip(img[...,::-1],0,255).astype(np.uint8)
px=(rgb.reshape(-1,3)>>3).astype(np.float32)
crit=(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,40,0.2)
_,labs,cent=cv2.kmeans(px[::7],15,None,crit,3,cv2.KMEANS_PP_CENTERS)
pal=(np.clip(np.round(cent),0,31).astype(np.uint8)<<3)
pimg=Image.new('P',(1,1)); pimg.putpalette(list(pal.flatten())+[0]*(768-45))
q=Image.fromarray(rgb).quantize(palette=pimg,dither=Image.Dither.FLOYDSTEINBERG)
idx=np.minimum(np.asarray(q),14)+1
p555=[0]+[int((r>>3)<<10|(g_>>3)<<5|(b>>3)) for r,g_,b in pal.astype(int)]
pats={}; plist=[]; tiles=[]
for ty in range(H//16):
    for tx in range(W//16):
        p=idx[ty*16:(ty+1)*16,tx*16:(tx+1)*16]; key=p.tobytes()
        if key not in pats: pats[key]=len(plist); plist.append({'indices':p.flatten().tolist()})
        tiles.append([pats[key],0])
json.dump({'format':'superoutride.tile-background','version':1,'name':'tsukuba-sky','patterns':plist,'palettes':[p555],'tiles':tiles},open(sys.argv[1],'w'))
print('patterns',len(plist),'colors',len(pal))
lut=np.array([[(v>>10)&31,(v>>5)&31,v&31] for v in p555])*8
Image.fromarray(lut[idx].astype(np.uint8)).crop((0,140,1504,340)).save(S+'sky_prev.png')
