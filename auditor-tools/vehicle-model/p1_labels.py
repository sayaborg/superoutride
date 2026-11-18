import sys,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend
from scipy import ndimage as ndi
G='/home/claude/work/in2/p1.glb'; B=rend.base_tex(G,0); T=B.astype(np.float32); RM=rend.base_tex(G,1).astype(np.float32)
pm=np.load('/home/claude/work/out/posmap.npz'); cov=pm['cov']
def msm(a,s):
    w=ndi.gaussian_filter(cov.astype(np.float32),s); return ndi.gaussian_filter(np.where(cov,a,0).astype(np.float32),s)/np.maximum(w,1e-6)
rough=msm(RM[...,1],3); metal=msm(RM[...,2],5)
mx=T.max(2); mn=T.min(2); sat=(mx-mn)/np.maximum(mx,1); r,g,b=T[...,0],T[...,1],T[...,2]
L=np.zeros(cov.shape,np.uint8)
L[(sat<0.20)&(mx>105)&(metal<32)&(rough<62)]=3
L[(sat>0.45)&(r>g*1.6)&(r>b*1.6)&(r>40)]=1
L[(sat>0.40)&(b>r*1.4)&(b>g*1.12)&(b>28)]=2
PAL={1:(215,5,17),2:(32,46,131),3:(235,235,233),6:(255,0,255)}
exact=np.zeros(cov.shape,np.uint8)
for k,v in PAL.items(): exact[(B==np.array(v,np.uint8)).all(2)]=k
# majority smoothing of the unpainted part only; what K painted is kept as painted
w=np.maximum(ndi.uniform_filter(cov.astype(np.float32),5),1e-6); sc=np.stack([ndi.uniform_filter(((L==i)&cov).astype(np.float32),5)/w for i in range(4)]); L=sc.argmax(0).astype(np.uint8)
L[exact>0]=exact[exact>0]; L[~cov]=0
for k in (0,1,2,3,6): print(k,int(((L==k)&cov).sum()))
np.save('/home/claude/work/out/p1_L0.npy',L); np.save('/home/claude/work/out/p1_exact.npy',exact)
