import sys; sys.path.insert(0,'tools')
import numpy as np, scipy.sparse as sp, view
w=np.load('work/weld.npz'); J=w['J']; inv=w['inv']; X=np.load('work/X1.npy').copy(); n=len(X)
fi=np.load('work/fitinfo.npy',allow_pickle=True).item(); s0,sy=fi['s0'],fi['sy']; q=sy/s0
tex=np.load('work/tex1.npy'); cls=np.load('work/cls1.npy')
js,binb,P,UV,I,img=view.mesh('in/e150-src.glb')
T=4096; tx=np.clip((UV[:,0]%1.0)*T,0,T-1).astype(int); ty=np.clip((UV[:,1]%1.0)*T,0,T-1).astype(int)
z=np.load('work/uvraster.npz'); tb=z['tb'].astype(np.int64); cov=tb>=0
body=np.zeros(n,bool); body[inv[cls[ty,tx]==1]]=True
pf=np.unique(tb[cov&(cls==1)]); body[J[pf].ravel()]=True
E=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]]); A=sp.coo_matrix((np.ones(len(E)*2),(np.concatenate([E[:,0],E[:,1]]),np.concatenate([E[:,1],E[:,0]]))),shape=(n,n)).tocsr()
body|=(A@body.astype(float))>0
print('painted body vertices (held):',int(body.sum()))
Cw=w['Cw']; lum=Cw.mean(1); X0=X.copy()
def fit(zc,y):
    A_=np.stack([2*zc,2*y,np.ones(len(zc))],1); b=zc*zc+y*y
    for _ in range(8):
        s,*_=np.linalg.lstsq(A_,b,rcond=None); cz,cy=s[0],s[1]; r=np.sqrt(s[2]+cz*cz+cy*cy)
        res=np.hypot(zc-cz,y-cy)-r; k=np.abs(res)<max(3*np.std(res),0.001); A_,b,zc,y=A_[k],b[k],zc[k],y[k]
    return cz,cy,r,np.std(res)
def tread(Xq,zt,y0,xa,xin,xout,rlo,rhi,circ):
    zq=(Xq[:,2]-zt)*circ; rr=np.hypot(Xq[:,1]-y0,zq)
    s=(lum<70)&(xa>xin+0.25*(xout-xin))&(xa<xout-0.25*(xout-xin))&(rr>rlo)&(rr<rhi)&(Xq[:,1]<y0)
    zc,y=zq[s],Xq[s,1]; ang=np.round(np.degrees(np.arctan2(y-y0,zc))/2).astype(int); keep=np.zeros(len(zc),bool)
    for a in np.unique(ang):
        mm=ang==a; keep[np.nonzero(mm)[0][rr[s][mm]>=np.percentile(rr[s][mm],90)]]=True
    return fit(zc[keep],y[keep])
# P225/75R15 (catalogue, E-150): diameter 15 in + 2 x 0.75 x 225 mm = 0.7185 m; treads 69.4 and 67.0 in (catalogue, p. 13)
SPEC={'F':(fi['zf'],0.3593,0.225,1.7628),'R':(fi['zr'],0.3593,0.225,1.7018)}
wh0=np.load('work/wheels0.npy',allow_pickle=True).item(); ex={}; total=np.zeros(n)
for ax,(zt,R,wd,track) in SPEC.items():
    for side,sx in (('L',1),('R',-1)):
        k=ax+side; xa=(X0[:,0])*sx; _,cy0,r0,xin,xout=wh0[k]; sxa=fi['sxF'] if ax=='F' else fi['sxR']
        xin=(xin-sx*fi['xc'])*sxa; xout=(xout-sx*fi['xc'])*sxa
        dz,cy,r,sd=tread(X0,zt,0.365,xa,xin,xout,0.28,0.40,q)
        cz=zt+dz/q
        rho=np.hypot((X0[:,2]-cz)*q,X0[:,1]-cy)
        c0=(xin+xout)/2; ann=(lum<70)&(rho>0.8*r)&(rho<r+0.003)&(xa>c0)
        half=np.percentile(xa[ann],99.9)-c0; xin,xout=c0-half,c0+half
        wr=np.clip((r+0.030-rho)/0.024,0,1); wx=np.clip((xa-(xin-0.06))/0.04,0,1)
        wgt=wr*wx*(~body)
        kR=R/r
        zq=(X0[:,2]-cz)*q; yq=X0[:,1]-cy; th=np.arctan2(zq,-yq); rho_=np.hypot(zq,yq)
        th0=np.arccos(min(cy/r,1.0)); env=cy/np.cos(np.clip(th,-1.2,1.2)); flat=np.abs(th)<th0
        dr=np.where(flat,(r-env)*np.clip((rho_-0.62*r)/np.maximum(env-0.62*r,1e-9),0,1),0.0); f=(rho_+dr)/np.maximum(rho_,1e-9)
        print(k,'flat on the ground: centre %.4f up, radius %.4f, cut %.1f mm over +-%.1f deg; made round'%(cy,r,(r-cy)*1000,np.degrees(th0)))
        zn=zt+zq*f*kR; yn=R+yq*f*kR; yc=R
        xo_new=track/2+wd/2; xi_new=track/2-wd/2
        xn=np.where(xa>=xin,xo_new-(xout-xa)*wd/(xout-xin),xa+(xi_new-xin))
        X[:,2]+=wgt*(zn-X0[:,2]); X[:,1]+=wgt*(yn-X0[:,1]); X[:,0]+=sx*wgt*(xn-xa)
        total=np.maximum(total,wgt)
        ex[k]=dict(centre=[round(sx*track/2,4),round(float(yc),4),round(float(zt),4)],radius=R,width=wd)
        bsel=body&(xa>xi_new)&(np.abs(X0[:,2]-zt)<0.6)&(X0[:,1]>R*0.5)
        dmin=(np.hypot(X0[bsel,2]-zt,X0[bsel,1]-yc)).min()
        print(k,'before: centre z %+.4f (axle %+.4f) y %.4f, radius %.4f (sd %.2f mm), x %.3f..%.3f | scale %.4f | arch: nearest body vertex %.3f m from the axle = %.0f mm above the new tread'%(cz,zt,cy,r,sd*1000,xin,xout,kR,dmin,(dmin-R)*1000))
moved=np.abs(X-X0).max(1)
print('vertices moved by the wheel step:',int((moved>1e-9).sum()),'| painted-body vertices moved:',int((moved[body]>1e-9).sum()))
np.save('work/X3.npy',X); np.save('work/wheel_extras.npy',ex,allow_pickle=True); np.save('work/body.npy',body); np.save('work/wheelw.npy',total)
for ax,(zt,R,wd,track) in SPEC.items():
    for side,sx in (('L',1),('R',-1)):
        xa=X[:,0]*sx; xi=track/2-wd/2; xo=track/2+wd/2
        dz,cy,r,sd=tread(X,zt,R,xa,xi,xo,R-0.06,R+0.03,1.0)
        rho=np.hypot(X[:,2]-zt,X[:,1]-R); g=(lum<70)&(total>0.99)&(rho>0.8*R)&(rho<R+0.003)&(xa>track/2)
        gc=(lum<70)&(total>0.99)&(X[:,1]<0.012)&(np.abs(X[:,2]-zt)<0.15)&(xa>0.5); cc=(np.percentile(xa[gc],1)+np.percentile(xa[gc],99))/2
        xo_m=np.percentile(xa[g],99.9)
        print(ax+side,'after (measured): centre z %+.4f y %.4f radius %.4f diameter %.4f | tread centre x %.4f (track %.4f) outer sidewall x %.4f section width %.4f | lowest point %.4f'%(zt+dz,cy,r,2*r,cc,2*cc,xo_m,2*(xo_m-cc),X[gc,1].min()))
