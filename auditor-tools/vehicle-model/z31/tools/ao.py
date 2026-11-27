import numpy as np,sys;sys.path.insert(0,'tools')
import trimesh
from trimesh.ray.ray_pyembree import RayMeshIntersector
def sphere(n):
    i=np.arange(n)+0.5;y=1-2*i/n;r=np.sqrt(1-y*y);t=i*np.pi*(3-5**0.5);return np.stack([r*np.cos(t),y,r*np.sin(t)],1)
def ao(P,N,I,sel,ndir=192,eps=1e-3):
    rm=RayMeshIntersector(trimesh.Trimesh(P,I,process=False));D=sphere(ndir)
    N=N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-20);o=P[sel]+N[sel]*eps;n=N[sel];num=np.zeros(len(sel));den=np.zeros(len(sel))
    for d in D:
        c=n@d;m=c>0
        if not m.any():continue
        hit=rm.intersects_any(o[m],np.broadcast_to(d,(m.sum(),3)));num[m]+=c[m]*(~hit);den[m]+=c[m]
    return num/np.maximum(den,1e-9)
