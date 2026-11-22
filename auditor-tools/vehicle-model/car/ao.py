import numpy as np,sys,io,time;sys.path.insert(0,'/home/claude/work928/tools');import glbio
import trimesh
from trimesh.ray.ray_pyembree import RayMeshIntersector
def sphere(n):
    i=np.arange(n)+0.5;y=1-2*i/n;r=np.sqrt(1-y*y);t=i*np.pi*(3-5**0.5);return np.stack([r*np.cos(t),y,r*np.sin(t)],1)
def load(path):
    js,b=glbio.load(path);pr=js['meshes'][0]['primitives'][0]
    P=glbio.acc(js,b,pr['attributes']['POSITION']).astype(np.float64);N=glbio.acc(js,b,pr['attributes']['NORMAL']).astype(np.float64)
    UV=glbio.acc(js,b,pr['attributes']['TEXCOORD_0']).astype(np.float64);I=glbio.acc(js,b,pr['indices']).reshape(-1,3).astype(np.int64);return js,b,P,N,UV,I
def ao(P,N,I,sel,ndir=192,ground=False,eps=1e-3):
    V=P;F=I
    if ground:
        g=np.array([[-50,0,-50],[50,0,-50],[50,0,50],[-50,0,50.]]);F=np.vstack([I,[[len(P),len(P)+2,len(P)+1],[len(P),len(P)+3,len(P)+2]]]);V=np.vstack([P,g])
    rm=RayMeshIntersector(trimesh.Trimesh(V,F,process=False));D=sphere(ndir)
    N=N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-20);o=P[sel]+N[sel]*eps;n=N[sel];num=np.zeros(len(sel));den=np.zeros(len(sel))
    for d in D:
        c=n@d;m=c>0
        if not m.any():continue
        hit=rm.intersects_any(o[m],np.broadcast_to(d,(m.sum(),3)));num[m]+=c[m]*(~hit);den[m]+=c[m]
    return num/np.maximum(den,1e-9)
