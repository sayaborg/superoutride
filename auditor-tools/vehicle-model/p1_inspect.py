import sys,numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend
from scipy.spatial import cKDTree
T=rend.base_tex('/home/claude/work/in2/p1.glb').astype(np.float32)
pm=np.load('/home/claude/work/out/posmap.npz'); cov=pm['cov']; pos=pm['pos']
mx=T.max(2); mn=T.min(2); sat=(mx-mn)/np.maximum(mx,1); lum=T.mean(2); r,g,b=T[...,0],T[...,1],T[...,2]
L=np.full(lum.shape,5,np.uint8); L[(sat<0.18)&(lum>165)]=3; L[lum<60]=4
L[(sat>0.45)&(r>g*1.6)&(r>b*1.6)&(r>90)]=1; L[(sat>0.45)&(b>r*1.5)&(b>g*1.15)&(b>50)]=2
L[(r>200)&(b>200)&(g<90)]=6; L[~cov]=0
names=['-','red','blue','white','dark','other','lamp']
ref={1:(215,5,17),2:(32,46,131),3:(235,235,233),6:(255,0,255)}
for k in (1,2,3,6):
    m=L==k; ex=(np.abs(T[m]-np.array(ref[k])).max(1)<1); c=T[m]
    print(names[k],'texels',m.sum(),'exact solid %.0f%%'%(100*ex.mean()),'mean',c.mean(0).round(),'p5-p95 lum',np.percentile(c.mean(1),[5,95]).round())
# symmetry: left (+X) master vs right
P=pos[cov]; lab=L[cov]; left=P[:,0]>0.004; right=P[:,0]<-0.004
tree=cKDTree(P[left]); d,i=tree.query(P[right]*np.array([-1,1,1]),workers=-1); ok=d<0.004
a=lab[right][ok]; bb=lab[left][i[ok]]
print('right texels',right.sum(),'with a mirror partner %.1f%%'%(100*ok.mean()),'class differs %.1f%%'%(100*(a!=bb).mean()))
M=np.zeros((7,7),int); np.add.at(M,(bb,a),1); print('rows = left class, cols = right class'); print(names[1:]); print(M[1:,1:])
Pr=P[right][ok]; diff=a!=bb
# where are the differences (paint classes only)
pd=diff&((a<=3)|(bb<=3)|(a==6)|(bb==6))
for nm,m in (('helmet y>1.12',Pr[:,1]>1.12),('torso/arms 0.8-1.12, z>-0.45',(Pr[:,1]>0.8)&(Pr[:,1]<=1.12)&(Pr[:,2]>-0.45)),('tail z<-0.45',Pr[:,2]<-0.45),('rest',~((Pr[:,1]>0.8)|(Pr[:,2]<-0.45)))):
    print(nm,'texels',m.sum(),'paint-class mismatch %.1f%%'%(100*pd[m].mean()))
np.savez('/home/claude/work/out/p1_sym.npz',P=Pr[pd].astype(np.float32))
np.save('/home/claude/work/out/p1_labels.npy',L)
