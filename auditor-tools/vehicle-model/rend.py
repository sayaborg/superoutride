import sys, io, os, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0,'/home/claude/work/scripts'); import glbio
def base_tex(p,i=0):
    b,j,jl=glbio.load(p); v=j['bufferViews'][j['images'][i]['bufferView']]; o=20+jl+8+v.get('byteOffset',0)
    return np.asarray(Image.open(io.BytesIO(bytes(b[o:o+v['byteLength']]))).convert('RGB'))
def geom(p,cache,n=6_000_000):
    if os.path.exists(cache): d=np.load(cache); return d['pts'],d['uv'],d['nn']
    b,j,jl=glbio.load(p); pr=j['meshes'][0]['primitives'][0]
    P=glbio.get(b,j,jl,pr['attributes']['POSITION']).astype(float); UV=glbio.get(b,j,jl,pr['attributes']['TEXCOORD_0']).astype(float)
    Nn=glbio.get(b,j,jl,pr['attributes']['NORMAL']).astype(float); I=glbio.get(b,j,jl,pr['indices']).reshape(-1,3).astype(np.int64)
    a,bb,c=P[I[:,0]],P[I[:,1]],P[I[:,2]]; area=np.linalg.norm(np.cross(bb-a,c-a),axis=1)
    rng=np.random.default_rng(1); ti=rng.choice(len(I),n,p=area/area.sum()); r1=np.sqrt(rng.random(n)); r2=rng.random(n)
    w=np.stack([1-r1,r1*(1-r2),r1*r2],1); pts=(P[I[ti]]*w[:,:,None]).sum(1); uv=(UV[I[ti]]*w[:,:,None]).sum(1); nn=(Nn[I[ti]]*w[:,:,None]).sum(1)
    nn/=np.linalg.norm(nn,axis=1,keepdims=True)+1e-9
    np.savez(cache,pts=pts.astype(np.float32),uv=uv.astype(np.float32),nn=nn.astype(np.float32)); return pts,uv,nn
def colors(T,uv):
    u=np.clip((uv[:,0]%1)*T.shape[1],0,T.shape[1]-1).astype(int); v=np.clip((uv[:,1]%1)*T.shape[0],0,T.shape[0]-1).astype(int); return T[v,u].astype(np.float32)
def render(pts,col,nn,right,up,sc,box,shade=True):
    right=np.array(right,float); up=np.array(up,float); f=np.cross(right,up)
    x=pts@right; y=pts@up; z=pts@f; x0,x1,y0,y1=box; W=int((x1-x0)*sc); H=int((y1-y0)*sc)
    px=((x-x0)*sc).astype(int); py=(H-1-(y-y0)*sc).astype(int); ok=(px>=0)&(px<W)&(py>=0)&(py<H)&((nn@f)>0.02)
    L=np.array([0.4,0.8,0.45]); L/=np.linalg.norm(L)
    sh=0.45+0.55*np.clip(nn@(L*0.7+f*0.3),0,1) if shade else np.ones(len(pts))
    o=np.argsort(z[ok]); img=np.full((H,W,3),70,np.uint8); img[py[ok][o],px[ok][o]]=np.clip(col[ok][o]*sh[ok][o,None]*(1.15 if shade else 1),0,255)
    return Image.fromarray(img)
VIEWS={'ql':([0.5,0,-0.866],[0,1,0]),'qr':([-0.5,0,-0.866],[0,1,0]),'rl':([-0.5,0,-0.866],[0,1,0]),'rr':([0.5,0,-0.866],[0,1,0]),'left':([0,0,-1],[0,1,0]),'right':([0,0,1],[0,1,0]),'rear':([-1,0,0],[0,1,0]),'front':([1,0,0],[0,1,0]),'top':([0,0,1],[1,0,0])}
def sheet(pts,nn,cols,names,views,sc,box,path,shade=False):
    rows=[]
    for v in views:
        r,u=VIEWS[v]; ims=[render(pts,c,nn,r,u,sc,box[v] if isinstance(box,dict) else box,shade) for c in cols]
        W=sum(i.width for i in ims)+8*(len(ims)-1); row=Image.new('RGB',(W,ims[0].height+18),(20,20,20)); x=0; d=ImageDraw.Draw(row)
        for i,nm in zip(ims,names): row.paste(i,(x,18)); d.text((x+4,3),f'{v} / {nm}',fill=(255,255,255)); x+=i.width+8
        rows.append(row)
    W=max(r.width for r in rows); H=sum(r.height for r in rows); im=Image.new('RGB',(W,H),(20,20,20)); y=0
    for r in rows: im.paste(r,(0,y)); y+=r.height
    im.save(path); return im.size
