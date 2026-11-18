import sys,json,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import fit as F, cand2 as C, setview
from PIL import Image, ImageDraw
F.LIGHTS['L2']=dict(main=[-0.25,0.85,0.46],amb=0.16,sky=0.26,mainw=0.95,fillw=0.10)
_full=F.full; CACHE={}
def full(cell):
    if cell not in CACHE: CACHE[cell]=_full('L2',cell)
    rgb,m,best,rr=CACHE[cell]; return rgb,m,np.where(best==2,3,best),rr,best
px=[[] for _ in range(4)]
for cl in F.fitcells:
    rgb,m,best,rr,b0=full(cl)
    for k in range(4): px[k].append(rr[m&(best==k)])
ramps=[]
for k,a in enumerate((3,3,0,8)):
    P=np.concatenate(px[k]).astype(float)
    if a==0: ramps.append(None); continue
    lum=P@F.LW; c=F.kmeans1(lum,a); l=np.abs(lum[:,None]-c[None]).argmin(1); ramps.append((c,np.array([P[l==i].mean(0) for i in range(len(c))])))
COL=dict(red=(215,5,17),blue=(32,46,131),yellow=(245,200,10),black=(38,38,42),green=(20,140,60),sky=(70,170,235),pink=(240,120,170),navy=(22,32,90),orange=(240,120,15),lime=(150,210,40),purple=(120,50,170),white=(235,235,233))
LIV=[('1 red / blue','red','blue'),('2 yellow / black','yellow','black'),('3 green / yellow','green','yellow'),('4 black / red','black','red'),('5 sky / pink','sky','pink'),('6 navy / orange','navy','orange'),('7 lime / purple','lime','purple'),('8 white / green','white','green')]
RULE={0:[(0.42,0),(0.90,0),(1.15,0.08)],1:[(0.48,0),(1.15,0.02),(1.5,0.25)]}
def ramp(role,name):
    if (role,name) in ((0,'red'),(1,'blue')): return ramps[role][1]
    b=np.array(COL[name],float); out=[]
    for s,mx in RULE[role]: c=np.clip(b*s,0,255); out.append(c+(255-c)*mx)
    return np.array(out)
def pic(cell,a,b):
    rgb,m,best,rr,b0=full(cell); H,W=m.shape; out=np.zeros((H,W,3),np.uint8); out[:]=F.BG; lum=rr.astype(float)@F.LW
    for k,cols in ((0,ramp(0,a)),(1,ramp(1,b)),(3,ramps[3][1])):
        c=ramps[k][0]; idx=np.abs(lum[...,None]-c[None,None]).argmin(2); s=m&(best==k); out[s]=cols[idx[s]].astype(np.uint8)
    out[m&(best==4)]=C.LAMPOFF; return out,m
cells=[(0,0),(4,0),(8,0),(16,0),(32,0),(0,-30)]
rows=[F.row(n,lambda c,a=a,b=b: pic(c,a,b),4,cells) for n,a,b in LIV]; setview.stack(rows,'/home/claude/work/out/liv8_sheet.png')
ims=[F.crop(*pic((0,0),a,b),7) for n,a,b in LIV]; W=sum(i.width+10 for i in ims); r=Image.new('RGB',(W,ims[0].height+16),F.BG); x=0; d=ImageDraw.Draw(r)
for i,(n,a,b) in zip(ims,LIV): r.paste(i,(x,16)); d.text((x+3,2),n,fill=(255,255,0)); x+=i.width+10
r.save('/home/claude/work/out/liv8_rear.png'); print(r.size); json.dump({n:[ramp(0,a).round().astype(int).tolist(),ramp(1,b).round().astype(int).tolist()] for n,a,b in LIV}|{'grey':ramps[3][1].round().astype(int).tolist()},open('/home/claude/work/out/liv8.json','w'))
