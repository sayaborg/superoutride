import sys; sys.path.insert(0,'tools')
import glbio, numpy as np, io
from PIL import Image
def mesh(path):
    js,binb=glbio.load(path)
    p=js['meshes'][0]['primitives'][0]
    P=glbio.acc(js,binb,p['attributes']['POSITION']).astype(np.float64)
    UV=glbio.acc(js,binb,p['attributes']['TEXCOORD_0']).astype(np.float64)
    I=glbio.acc(js,binb,p['indices']).reshape(-1,3).astype(np.int64)
    def img(i):
        bv=js['bufferViews'][js['images'][i]['bufferView']]
        return Image.open(io.BytesIO(bytes(binb[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])))
    return js,binb,P,UV,I,img
def vnormals(P,I):
    fn=np.cross(P[I[:,1]]-P[I[:,0]],P[I[:,2]]-P[I[:,0]])
    N=np.zeros_like(P)
    for k in range(3): np.add.at(N,I[:,k],fn)
    N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-20
    return N
def tex(UV,im):
    a=np.asarray(im.convert('RGB')); h,w=a.shape[:2]
    x=np.clip((UV[:,0]%1.0)*w,0,w-1).astype(int); y=np.clip((UV[:,1]%1.0)*h,0,h-1).astype(int)
    return a[y,x].astype(np.float64)
VIEWS={'side_r':((0,0,-1),(0,1,0),(-1,0,0)), # right dir, up dir, toward-viewer dir  (looking from -x)
       'side_l':((0,0,1),(0,1,0),(1,0,0)),
       'front':((-1,0,0),(0,1,0),(0,0,1)),'rear':((1,0,0),(0,1,0),(0,0,-1)),
       'top':((0,0,1),(1,0,0),(0,1,0))}
def render(P,I,N,C,view,W=1400,light=(0.3,0.8,0.5),mode='tex',dense=True):
    if isinstance(view,str): r,u,f=[np.array(v,float) for v in VIEWS[view]]
    else: r,u,f=view
    pts=P; nn=N; cc=C
    if dense:
        # add edge midpoints + centroids
        A,B,Cc=P[I[:,0]],P[I[:,1]],P[I[:,2]]
        pts=np.concatenate([P,(A+B+Cc)/3,(A+B)/2,(B+Cc)/2,(A+Cc)/2])
        na=N[I[:,0]]+N[I[:,1]]+N[I[:,2]]; na/=np.linalg.norm(na,axis=1,keepdims=True)+1e-20
        nn=np.concatenate([N,na,na,na,na])
        ca=(C[I[:,0]]+C[I[:,1]]+C[I[:,2]])/3
        cc=np.concatenate([C,ca,(C[I[:,0]]+C[I[:,1]])/2,(C[I[:,1]]+C[I[:,2]])/2,(C[I[:,0]]+C[I[:,2]])/2])
    x=pts@r; y=pts@u; z=pts@f
    x0,x1,y0,y1=x.min(),x.max(),y.min(),y.max()
    s=(W-20)/(x1-x0); H=int((y1-y0)*s)+20
    px=np.clip(((x-x0)*s+10).astype(int),0,W-1); py=np.clip((H-10-(y-y0)*s).astype(int),0,H-1)
    L=np.array(light,float); L=L[0]*r+L[1]*u+L[2]*f; L/=np.linalg.norm(L)
    d=np.clip(nn@L,0,1)
    if mode=='tex': col=cc*(0.35+0.75*d)[:,None]
    else:
        h=r*0+L+f; h/=np.linalg.norm(h); sp=np.clip(nn@h,0,1)**60
        col=(np.array([150,150,160.])[None,:]*(0.15+0.85*d)[:,None]+255*sp[:,None]*0.9)
    order=np.argsort(z)
    img=np.full((H,W,3),40,np.uint8)
    img[py[order],px[order]]=np.clip(col[order],0,255).astype(np.uint8)
    return Image.fromarray(img)
