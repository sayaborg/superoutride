import sys; sys.path.insert(0,'tools')
import view, numpy as np
L,W,H=4.523,1.836,1.282
def remap(P):
    P=P.astype(np.float64).copy()
    sy=H/P[:,1].max()
    body_half=np.abs(P[P[:,2]<0,0]).max()   # widest point is the rear fender; mirrors are ahead of z=0
    sx=(W/2)/body_half
    zc=[0.2707,-0.2681]; hz=0.088; t=0.03
    zz=np.linspace(P[:,2].min(),P[:,2].max(),20001)
    bump=np.zeros_like(zz)
    for c in zc:
        d=np.abs(zz-c)
        b=np.where(d<=hz,1.0,np.where(d>=hz+t,0.0,0.5+0.5*np.cos(np.pi*(d-hz)/t)))
        bump=np.maximum(bump,b)
    # slope = sy inside, s_o outside ; total length L
    dz=zz[1]-zz[0]
    a=np.sum(bump)*dz; b=np.sum(1-bump)*dz
    so=(L-sy*a)/b
    slope=sy*bump+so*(1-bump)
    f=np.concatenate([[0],np.cumsum((slope[1:]+slope[:-1])/2)*dz])
    fz=lambda z: np.interp(z,zz,f)
    zf,zr=fz(zc[0]),fz(zc[1])
    mid=(zf+zr)/2
    out=np.stack([P[:,0]*sx,P[:,1]*sy,fz(P[:,2])-mid],1)
    info=dict(sx=sx,sy=sy,so=so,front=zf-mid,rear=zr-mid,wheelbase=zf-zr,cy=0.0760*sy)
    return out,info
if __name__=='__main__':
    js,binb,P,UV,I,img=view.mesh('src/pink_sports_car_3d_model.glb')
    Q,info=remap(P); print(info); print(Q.min(0),Q.max(0))
    np.save('out/P1.npy',Q)
