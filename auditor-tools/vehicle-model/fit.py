import sys, json, numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import cand2 as C, setview
from PIL import Image, ImageDraw
LW=np.array([0.30,0.59,0.11]); BG=(74,112,74)
LIGHTS={'H':dict(main=[-0.15,0.92,0.36],amb=0.22,sky=0.30,mainw=0.80,fillw=0.05),
        'H2':dict(main=[-0.25,0.85,0.46],amb=0.16,sky=0.26,mainw=0.95,fillw=0.10)}
cells=[(0,0),(4,0),(8,0),(16,0),(24,0),(32,0),(0,-20),(0,-40)]; fitcells=[(y,0) for y in range(0,64,4)]+[(0,-20),(0,-40),(0,20),(0,40)]
def full(light,cell):
    o=dict(C.BASE); o.update(LIGHTS[light]); o.update(spin=1,full=1,cuts=(0.9,0.5)); return C.bake(cell[0],cell[1],o)
def kmeans1(v,k,it=40):
    c=np.quantile(v,(np.arange(k)+0.5)/k)
    for _ in range(it):
        l=np.abs(v[:,None]-c[None]).argmin(1); c=np.array([v[l==i].mean() if (l==i).any() else c[i] for i in range(k)])
    return np.sort(c)
def fit(light,alloc):
    px=[[] for _ in range(4)]
    for cl in fitcells:
        rgb,m,best,rr=full(light,cl)
        for k in range(4): px[k].append(rr[m&(best==k)])
    ramps=[]
    for k in range(4):
        P=np.concatenate(px[k]).astype(float); lum=P@LW; c=kmeans1(lum,alloc[k]); l=np.abs(lum[:,None]-c[None]).argmin(1)
        ramps.append((c,np.array([P[l==i].mean(0) for i in range(len(c))])))
    return ramps
BAYER=(np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]])+0.5)/16
def quant(light,cell,ramps,dither=False):
    rgb,m,best,rr=full(light,cell); H,W=m.shape; out=np.zeros((H,W,3),np.uint8); out[:]=BG; lum=rr.astype(float)@LW
    yy,xx=np.mgrid[0:H,0:W]; th=BAYER[yy%4,xx%4]
    for k in range(4):
        c,cols=ramps[k]; s=m&(best==k)
        if dither and len(c)>1:
            hi=np.clip(np.searchsorted(c,lum),1,len(c)-1); lo=hi-1; t=np.clip((lum-c[lo])/np.maximum(c[hi]-c[lo],1e-6),0,1); idx=np.where(t>th,hi,lo)
        else: idx=np.abs(lum[...,None]-c[None,None]).argmin(2)
        out[s]=cols[idx[s]].astype(np.uint8)
    out[m&(best==4)]=C.LAMPOFF; return out,m
def crop(a,m,zoom):
    ys,xs=np.where(m); a=a[max(ys.min()-2,0):ys.max()+3,max(xs.min()-3,0):xs.max()+4]; return Image.fromarray(a).resize((a.shape[1]*zoom,a.shape[0]*zoom),Image.NEAREST)
def row(label,fn,zoom=4,cs=cells):
    ims=[crop(*fn(c),zoom) for c in cs]; W=sum(i.width+8 for i in ims); H=max(i.height for i in ims)+14; r=Image.new('RGB',(W,H),BG); x=0
    for i in ims: r.paste(i,(x,H-i.height)); x+=i.width+8
    ImageDraw.Draw(r).text((3,1),label,fill=(255,255,0)); return r
def fullimg(light): 
    def f(c):
        rgb,m,best,rr=full(light,c); a=np.where(m[...,None],rgb,np.array(BG,np.uint8)).astype(np.uint8); a[m&(best==4)]=C.LAMPOFF; return a,m
    return f
if __name__=='__main__':
    specs=[('1  3-3-3 + 5 greys, steps fitted to the lit colors','H',(3,3,3,5),False),
           ('2  red 4, blue 3, white 2 + 5 greys','H',(4,3,2,5),False),
           ('3  red 3, blue 4, white 2 + 5 greys','H',(3,4,2,5),False),
           ('4  as 1, with dithering between steps','H',(3,3,3,5),True),
           ('5  as 1, light a little lower and stronger (more contrast)','H2',(3,3,3,5),False)]
    rows=[row('no color limit, light H',fullimg('H'))]; big=[row('no color limit, light H',fullimg('H'),8,cells[:3])]; info={}
    for label,light,alloc,dith in specs:
        r=fit(light,alloc); info[label]=[[list(map(int,c)) for c in cols] for _,cols in r]
        f=lambda c,light=light,r=r,dith=dith: quant(light,c,r,dith); rows.append(row(label,f)); big.append(row(label,f,8,cells[:3]))
    rows.append(row('no color limit, light H2',fullimg('H2')))
    setview.stack(rows,'/home/claude/work/out/palette_choices.png'); setview.stack(big,'/home/claude/work/out/palette_choices_big.png'); json.dump(info,open('/home/claude/work/out/palette_fit.json','w'),indent=1)
