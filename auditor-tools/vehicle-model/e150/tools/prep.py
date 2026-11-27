import sys; sys.path.insert(0,'tools')
import view, rast, numpy as np
js,binb,P,UV,I,img=view.mesh('in/e150-src.glb')
u,inv=np.unique(P.round(7),axis=0,return_inverse=True); inv=inv.ravel(); J=inv[I]
X=np.zeros((len(u),3)); X[inv]=P
print('welded',len(u),'of',len(P))
T=4096; a=np.asarray(img(0).convert('RGB')); print(a.shape)
C=view.tex(UV,img(0)); Cw=np.zeros((len(u),3)); cnt=np.zeros(len(u))
np.add.at(Cw,inv,C); np.add.at(cnt,inv,1); Cw/=cnt[:,None]
np.savez('work/weld.npz',inv=inv,J=J,X=X,Cw=Cw)
Puv=np.stack([UV[:,0]*T,T-UV[:,1]*T,np.zeros(len(UV))],1)
print('uv range',UV.min(0),UV.max(0))
tb,wb,_,_,_=rast.raster(Puv,I,((1,0,0),(0,1,0),(0,0,1)),W=T+20,bounds=(0,T,0,T))
tb=tb[10:10+T,10:10+T]; wb=wb[10:10+T,10:10+T]
print('covered',(tb>=0).mean())
np.savez('work/uvraster.npz',tb=tb.astype(np.int32),wb=wb.astype(np.float16))
np.save('work/tex0.npy',a)
print('images',len(js['images']),[ (i.get('name'),i.get('mimeType')) for i in js['images']], 'materials',js['materials'])
