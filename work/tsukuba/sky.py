import numpy as np, json, math, sys
W,H,HZ=1504,640,320
rng=np.random.default_rng(7)
def rgb555(r,g,b): return (r<<10)|(g<<5)|b
PAL=[0,
 rgb555(9,17,29),   # 1 zenith blue
 rgb555(12,20,30),  # 2
 rgb555(16,23,31),  # 3
 rgb555(21,26,31),  # 4 pale blue at the horizon
 rgb555(31,31,31),  # 5 cloud white
 rgb555(26,28,31),  # 6 cloud shade
 rgb555(15,19,22),  # 7 far hills (haze blue-grey)
 rgb555(8,13,9),    # 8 tree line dark
 rgb555(11,16,10),  # 9 tree line light
 rgb555(13,19,8),   # 10 ground below the horizon
 rgb555(19,22,26),  # 11 haze band
 rgb555(12,16,20),  # 12 Mt Tsukuba
 rgb555(24,27,31),  # 13
 rgb555(5,9,7),     # 14
 rgb555(31,31,31)]
img=np.zeros((H,W),np.uint8)
bayer=np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]])/16.0
# sky gradient 1..4 with ordered dither
for y in range(HZ):
    t=(y/HZ)**1.6*3.0      # 0 at the top .. 3 at the horizon
    for x0 in range(0,W,4):
        pass
ys=np.arange(HZ)[:,None]; xs=np.arange(W)[None,:]
t=(ys/HZ)**1.5*3.0+0*xs
lvl=np.floor(t+bayer[ys%4,xs%4]).astype(int); img[:HZ]=np.clip(1+lvl,1,4)
# haze band just above the horizon
img[HZ-10:HZ][(bayer[np.arange(HZ-10,HZ)[:,None]%4,xs%4]<0.6)]=11
# cumulus: soft blobs low in the sky, periodic in x
def blob(cx,cy,rx,ry,col,shade):
    y0,y1=max(0,int(cy-ry)),min(HZ-12,int(cy+ry)+1)
    for y in range(y0,y1):
        for x in range(int(cx-rx),int(cx+rx)+1):
            d=((x-cx)/rx)**2+((y-cy)/ry)**2
            if d<=1:
                img[y,x%W]=shade if (y-cy)/ry>0.45 else col
for i in range(11):
    cx=rng.uniform(0,W); cy=rng.uniform(190,285); n=rng.integers(3,7)
    for j in range(n):
        blob(cx+rng.uniform(-40,40),cy+rng.uniform(-6,6)-abs(j-n/2)*0,rng.uniform(14,34),rng.uniform(5,11),5,6)
    img[int(cy)+7:int(cy)+10,:]=np.where(img[int(cy)+7:int(cy)+10,:]==5,6,img[int(cy)+7:int(cy)+10,:])
# far hills: low haze-coloured line all round (2-5 px), Mt Tsukuba's twin peaks at column MT
def ridge(base,amp,seed,col,k=6):
    r=np.random.default_rng(seed); h=np.zeros(W)
    for f in range(1,k):
        h+=r.uniform(0.3,1)/f*np.sin(2*np.pi*f*np.arange(W)/W*r.integers(2,7)+r.uniform(0,6.28))
    h=(h-h.min())/(h.max()-h.min())*amp+base
    for x in range(W): img[HZ-int(round(h[x])):HZ,x]=col
    return h
ridge(2,4,3,7)
MT=int(sys.argv[2]) if len(sys.argv)>2 else 400
for x in range(-70,71):
    hgt=9.0*math.exp(-((x+9)/22)**2)+8.0*math.exp(-((x-12)/20)**2)+2.5*math.exp(-(x/55)**2)
    c=(MT+x)%W; img[HZ-int(round(hgt)):HZ,c]=12
# tree line and the ground below
h=ridge(3,5,11,8,k=9)
for x in range(W):
    top=HZ-int(round(h[x]))
    if (x//3)%2==0 and top<HZ: img[top,x]=9
img[HZ:]=10
img[HZ:HZ+3]=8
assert img.min()>=1
# tiles
pats={}; plist=[]; tiles=[]
for ty in range(H//16):
    for tx in range(W//16):
        p=img[ty*16:(ty+1)*16,tx*16:(tx+1)*16]; key=p.tobytes()
        if key not in pats: pats[key]=len(plist); plist.append({'indices':p.flatten().tolist()})
        tiles.append([pats[key],0])
doc={'format':'superoutride.tile-background','version':1,'name':'tsukuba-sky','patterns':plist,'palettes':[PAL],'tiles':tiles}
json.dump(doc,open(sys.argv[1],'w'))
print('patterns',len(plist))
from PIL import Image
lut=np.array([[(c>>10)&31,(c>>5)&31,c&31] for c in PAL])*8
Image.fromarray(lut[img].astype(np.uint8)).crop((0,150,1504,360)).save('sky_prev.png')
