import sys,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend
from scipy import ndimage as ndi
T=rend.base_tex('/home/claude/work/out/n2_fit.glb').astype(np.float32)
pm=np.load('/home/claude/work/out/posmap.npz'); cov=pm['cov']
# posmap row index = v*S ; texture row = v*S too (rend.colors uses T[v,u])
mx=T.max(2); mn=T.min(2); sat=(mx-mn)/np.maximum(mx,1); lum=T.mean(2)
r,g,b=T[...,0],T[...,1],T[...,2]
L=np.full(lum.shape,5,np.uint8)                      # 5 other (metal, skin, gold)
L[(sat<0.18)&(lum>165)]=3                            # white
L[lum<60]=4                                          # dark
L[(sat>0.45)&(r>g*1.6)&(r>b*1.6)&(r>90)]=1           # red
L[(sat>0.45)&(b>r*1.5)&(b>g*1.15)&(b>50)]=2          # blue
# majority smoothing to drop JPEG noise
best=np.zeros(L.shape,np.float32); out=L.copy()
for k in range(1,6):
    f=ndi.uniform_filter((L==k).astype(np.float32),5)
    m=f>best; out[m]=k; best[m]=f[m]
out[~cov]=0
for k,n in enumerate(['-','red','blue','white','dark','other']): print(n,int((out==k).sum()))
np.save('/home/claude/work/out/n2_labels.npy',out)
