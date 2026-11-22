import sys; sys.path.insert(0,'tools')
import glbio, view, numpy as np, json, hashlib, scipy.sparse as sp
OUT=sys.argv[1]; TRACK={'F':1.549,'R':1.546}; SRC='out/porsche-928-s4-1987-v2.glb'
js,binb,_,UV,I,img=view.mesh(SRC); prim=js['meshes'][0]['primitives'][0]
w=np.load('out/weld.npz'); inv=w['inv']; J=w['J']; Cw=np.load('out/weldP.npz')['Cw']; n=inv.max()+1
X=np.load('out/X_b.npy').copy()            # fitted + smoothed, wheels untouched
pink=(Cw[:,0]>140)&(Cw[:,0]-Cw[:,1]>25)&(Cw[:,0]-Cw[:,2]>5)&(Cw[:,1]>90); lum=Cw.mean(1)
# painted body per the final texture, one ring wider: never moved by the wheel step
red=(np.abs(view.tex(UV,img(0))-np.array([231,10,14])).max(1)<1)
body=np.zeros(n,bool); body[inv[red]]=True; redv=body.copy()
E_=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]]); A=sp.coo_matrix((np.ones(len(E_)*2),(np.concatenate([E_[:,0],E_[:,1]]),np.concatenate([E_[:,1],E_[:,0]]))),shape=(n,n)).tocsr()
body|=(A@body.astype(float))>0
m=redv&(X[:,2]<-0.1); hi,lo=X[m,0].max(),X[m,0].min(); kx=1.836/(hi-lo); X[:,0]=(X[:,0]-(hi+lo)/2)*kx
# plan taper: the model narrows steadily toward the front; bring the front fenders to the same 1.836 m as the rear
mir=(np.abs(X[:,0])>0.80)&(X[:,2]>-0.05)&(X[:,2]<0.45)&(X[:,1]>0.80)
fr=redv&~mir&(X[:,2]>0.9)&(X[:,2]<1.6); FF=0.918/np.abs(X[fr,0]).max()
t=np.clip((X[:,2]+0.9)/1.8,0,1); X[:,0]*=1+(FF-1)*t*t*(3-2*t)
print('front factor %.4f'%FF)
Xbody=X.copy()
def fit(z,y):
    A_=np.stack([2*z,2*y,np.ones(len(z))],1); b=z*z+y*y
    for _ in range(8):
        s,*_=np.linalg.lstsq(A_,b,rcond=None); cz,cy=s[0],s[1]; r=np.sqrt(s[2]+cz*cz+cy*cy)
        res=np.hypot(z-cz,y-cy)-r; k=np.abs(res)<max(3*np.std(res),0.002); A_,b,z,y=A_[k],b[k],z[k],y[k]
    return cz,cy,r
ex=js['nodes'][0]['extras']
for ax,(zt,R,wd) in {'F':(1.25,0.3157,0.225),'R':(-1.25,0.3135,0.245)}.items():
    fa=FF if ax=='F' else 1.0; W0=(0.616*kx*fa,0.873*kx*fa); XO=W0[1]; d=XO-wd/2-TRACK[ax]/2
    for side,sx in (('L',1),('R',-1)):
        xa=X[:,0]*sx; rr=np.hypot(X[:,1]-0.305,X[:,2]-zt)
        s=(lum<70)&(np.abs(xa-(W0[0]+W0[1])/2)<0.06)&(rr>0.27)&(rr<0.335)&(X[:,1]<0.42)
        z,y=X[s,2],X[s,1]; ang=np.round(np.degrees(np.arctan2(y-0.305,z-zt))/2).astype(int); keep=np.zeros(len(z),bool)
        for a in np.unique(ang):
            mm=ang==a; keep[np.nonzero(mm)[0][rr[s][mm]>=np.percentile(rr[s][mm],90)]]=True
        cz,cy,r=fit(z[keep],y[keep]); k=R/r
        rho=np.hypot(X[:,2]-cz,X[:,1]-cy)
        wgt=np.clip((r+0.030-rho)/0.024,0,1)*(xa>0.5)*(~body)*(1-np.clip((xa-(XO+0.002))/0.010,0,1))
        zn=zt+(X[:,2]-cz)*k; yn=R+(X[:,1]-cy)*k
        xn=np.where(xa>=W0[0],XO-(XO-xa)*wd/(W0[1]-W0[0]),xa+(W0[1]-W0[0]-wd)*np.clip((xa-0.5)/(W0[0]-0.5),0,1))-d*np.clip((xa-0.5)/0.1,0,1)
        X[:,2]+=wgt*(zn-X[:,2]); X[:,1]+=wgt*(yn-X[:,1]); X[:,0]+=sx*np.minimum(1,wgt*4)*(xn-xa)
        ex[f'wheel_{ax}{side}']={'center':[round(sx*(XO-wd/2-d),4),R,zt],'radius':R,'width':wd}
        print(ax+side,'tread before: centre z %.4f y %.4f r %.4f'%(cz,cy,r))
print('painted-body vertices moved by the wheel step:',int((np.abs(X-Xbody).max(1)[body]>1e-9).sum()))
fn=np.cross(X[J[:,1]]-X[J[:,0]],X[J[:,2]]-X[J[:,0]]); N=np.zeros_like(X)
for i in range(3): np.add.at(N,J[:,i],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-20
P=X[inv].astype('<f4'); Nv=N[inv].astype('<f4')
for name,arr in (('POSITION',P),('NORMAL',Nv)):
    a=js['accessors'][prim['attributes'][name]]; bv=js['bufferViews'][a['bufferView']]; o=bv.get('byteOffset',0)+a.get('byteOffset',0); binb[o:o+arr.nbytes]=arr.tobytes()
    if name=='POSITION': a['min']=[float(v) for v in P.min(0)]; a['max']=[float(v) for v in P.max(0)]
ex['overall']={'length':round(float(P[:,2].max()-P[:,2].min()),4),'height':round(float(P[m_:=body][:,1].max()) if False else float(X[:,1].max()),4),'widthBody':1.836,'widthMirrors':round(float(P[:,0].max()-P[:,0].min()),4)}
glbio.save(OUT,js,binb); np.save(OUT.replace('.glb','.npy'),X); print(OUT,hashlib.sha256(open(OUT,'rb').read()).hexdigest())
