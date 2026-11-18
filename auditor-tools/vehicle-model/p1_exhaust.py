import sys,json,numpy as np
from scipy import ndimage as ndi
from PIL import Image
O='/home/claude/work/out/'; T=np.asarray(Image.open(O+'p1_tex_c.png').convert('RGB')).copy(); L=np.load(O+'p1_L_c.npy')
pm=np.load(O+'posmap.npz'); pos=pm['pos'].astype(float); nor=pm['nor'].astype(float); cov=pm['cov']
n=nor/(np.linalg.norm(nor,axis=2,keepdims=True)+1e-9); x,y,z=pos[...,0],pos[...,1],pos[...,2]; ax=np.abs(x)
box=cov&(L==0)&(z<-0.45)&(ax>0.12)&(ax<0.26)&(y>0.66)&(y<0.86); face=box&(n[...,2]<-0.5)&(T.max(2)>120)
print('face texels',face.sum(),'z pct',np.percentile(z[face],[2,50,98]).round(3))
q=np.c_[ax[face],y[face],z[face]]; c=np.array([[0.187,0.798],[0.187,0.723]])
for it in range(20):
    lab=((q[:,None,:2]-c[None])**2).sum(2).argmin(1); c=np.array([q[lab==k,:2].mean(0) for k in range(2)])
outs=[]
for k in range(2):
    p=q[lab==k]; r=np.hypot(*(p[:,:2]-c[k]).T); R=np.percentile(r,92); zend=np.percentile(p[:,2],5); outs.append((c[k],R,zend)); print('outlet',k,'|x| %.3f y %.3f R %.3f end z %.3f n %d'%(c[k][0],c[k][1],R,zend,len(p)))
SILVER=(226,226,230); BLACK=(8,8,8); nh=nr=0
for (cc,R,zend) in outs:
    rho=np.hypot(ax-cc[0],y-cc[1]); near=cov&(L==0)&(z>zend-0.01)&(z<zend+0.10)
    hole=near&(rho<0.55*R)&(z<zend+0.09); ring=near&(rho>=0.55*R)&(rho<=1.12*R)&(z<zend+0.04)
    T[ring]=SILVER; T[hole]=BLACK; nh+=hole.sum(); nr+=ring.sum()
print('texels hole',nh,'ring',nr)
dist,(iy,ix)=ndi.distance_transform_edt(~cov,return_indices=True); pad=(~cov)&(dist<=8); T[pad]=T[iy[pad],ix[pad]]
Image.fromarray(T).save(O+'p1_tex_d.png')
json.dump({'ring':list(SILVER),'hole':list(BLACK),'outlets':[{'center':[s*round(float(cc[0]),4),round(float(cc[1]),4),round(float(zend),4)],'radius':round(float(R),4)} for (cc,R,zend) in outs for s in (1,-1)]},open(O+'p1_exhaust.json','w'))
