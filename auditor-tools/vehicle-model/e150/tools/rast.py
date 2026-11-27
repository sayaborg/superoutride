import numpy as np
from PIL import Image
VIEWS={'side_r':((0,0,1),(0,1,0),(-1,0,0)),'side_l':((0,0,-1),(0,1,0),(1,0,0)),
       'front':((1,0,0),(0,1,0),(0,0,1)),'rear':((-1,0,0),(0,1,0),(0,0,-1)),'top':((0,0,1),(1,0,0),(0,1,0))}
def basis(view):
    if isinstance(view,str): return [np.array(v,float) for v in VIEWS[view]]
    return view
def persp(az,el):
    # az: degrees around y from front(+z) toward +x ; el elevation
    a=np.radians(az); e=np.radians(el)
    f=np.array([np.sin(a)*np.cos(e),np.sin(e),np.cos(a)*np.cos(e)])
    r=np.cross([0,1,0],f); r/=np.linalg.norm(r); u=np.cross(f,r)
    return r,u,f
def raster(P,I,view,W=1400,bounds=None):
    r,u,f=basis(view)
    x=P@r; y=P@u; z=P@f
    if bounds is None: bounds=(x.min(),x.max(),y.min(),y.max())
    x0,x1,y0,y1=bounds
    s=(W-20)/(x1-x0); H=int(np.ceil((y1-y0)*s))+20
    X=(x-x0)*s+10; Y=H-10-(y-y0)*s
    ax,ay,az=X[I[:,0]],Y[I[:,0]],z[I[:,0]]; bx,by,bz=X[I[:,1]],Y[I[:,1]],z[I[:,1]]; cx,cy,cz=X[I[:,2]],Y[I[:,2]],z[I[:,2]]
    den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
    ok=np.abs(den)>1e-12
    minx=np.floor(np.minimum(np.minimum(ax,bx),cx)).astype(int); maxx=np.ceil(np.maximum(np.maximum(ax,bx),cx)).astype(int)
    miny=np.floor(np.minimum(np.minimum(ay,by),cy)).astype(int); maxy=np.ceil(np.maximum(np.maximum(ay,by),cy)).astype(int)
    zb=np.full(H*W,-1e9); tb=np.full(H*W,-1,np.int64); wb=np.zeros((H*W,3),np.float32)
    bw=maxx-minx+1; bh=maxy-miny+1
    size=np.maximum(bw,bh)
    def batch(idx,S):
        for dy in range(S):
            for dx in range(S):
                px=minx[idx]+dx; py=miny[idx]+dy
                m=(dx<bw[idx])&(dy<bh[idx])&(px>=0)&(px<W)&(py>=0)&(py<H)
                if not m.any(): continue
                ii=idx[m]; qx=px[m]+0.5; qy=py[m]+0.5
                w0=((by[ii]-cy[ii])*(qx-cx[ii])+(cx[ii]-bx[ii])*(qy-cy[ii]))/den[ii]
                w1=((cy[ii]-ay[ii])*(qx-cx[ii])+(ax[ii]-cx[ii])*(qy-cy[ii]))/den[ii]
                w2=1-w0-w1
                ins=(w0>=-1e-6)&(w1>=-1e-6)&(w2>=-1e-6)
                if not ins.any(): continue
                ii=ii[ins]; w0=w0[ins]; w1=w1[ins]; w2=w2[ins]
                pix=(py[m][ins])*W+px[m][ins]
                zz=w0*az[ii]+w1*bz[ii]+w2*cz[ii]
                o=np.argsort(zz,kind='stable')
                pix=pix[o]; zz=zz[o]; ii=ii[o]; ww=np.stack([w0,w1,w2],1)[o]
                better=zz>zb[pix]
                # last write wins among duplicates (sorted ascending z) ; then check
                pix=pix[better]; zz=zz[better]; ii=ii[better]; ww=ww[better]
                zb[pix]=zz; tb[pix]=ii; wb[pix]=ww
    idx_all=np.nonzero(ok)[0]
    for S,lo,hi in [(3,0,3),(6,4,6),(12,7,12),(24,13,24),(48,25,48),(96,49,96),(200,97,200),(600,201,100000)]:
        idx=idx_all[(size[idx_all]>=lo)&(size[idx_all]<=hi)]
        if len(idx)==0: continue
        if S<=48: 
            for k in range(0,len(idx),400000): batch(idx[k:k+400000],S)
        else:
            for t in idx:
                batch(np.array([t]),int(size[t]))
    return tb.reshape(H,W),wb.reshape(H,W,3),zb.reshape(H,W),(r,u,f),bounds
def shade(P,I,N,C,view,W=1400,mode='tex',light=(0.35,0.8,0.5),ss=2,bounds=None,bg=40):
    tb,wb,zb,(r,u,f),bounds=raster(P,I,view,W*ss,bounds)
    H,Wd=tb.shape; m=tb>=0
    t=tb[m]; w=wb[m]
    n=(N[I[t,0]]*w[:,0:1]+N[I[t,1]]*w[:,1:2]+N[I[t,2]]*w[:,2:3]); n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-20
    L=np.array(light,float); L=L[0]*r+L[1]*u+L[2]*f; L/=np.linalg.norm(L)
    d=np.clip(n@L,0,1)
    img=np.full((H,Wd,3),bg,np.float64)
    if mode=='tex':
        c=(C[I[t,0]]*w[:,0:1]+C[I[t,1]]*w[:,1:2]+C[I[t,2]]*w[:,2:3])
        img[m]=c*(0.4+0.7*d)[:,None]
    elif mode=='flat':
        c=(C[I[t,0]]*w[:,0:1]+C[I[t,1]]*w[:,1:2]+C[I[t,2]]*w[:,2:3]); img[m]=c
    else:
        # zebra-ish gloss: reflect view dir, stripes by reflected elevation
        refl=2*(n@f)[:,None]*n-f
        el=refl@u; az=refl@r
        stripes=0.5+0.5*np.sign(np.sin(el*40))
        h=L+f; h/=np.linalg.norm(h); sp=np.clip(n@h,0,1)**80
        if mode=='zebra': img[m]=(60+150*stripes)[:,None]*np.ones(3)
        else: img[m]=(np.array([150,150,160.])[None,:]*(0.15+0.85*d)[:,None]+255*sp[:,None])
    im=Image.fromarray(np.clip(img,0,255).astype(np.uint8))
    if ss>1: im=im.resize((Wd//ss,H//ss),Image.LANCZOS)
    return im
def shade_uv(P,I,N,UV,tex,view,W=1400,light=(0.35,0.8,0.5),ss=2,bounds=None,bg=40,crop=None):
    """per-pixel texture lookup through the UVs (tex: HxWx3 uint8 array)"""
    tb,wb,zb,(r,u,f),bounds=raster(P,I,view,W*ss,bounds)
    H,Wd=tb.shape; m=tb>=0; t=tb[m]; w=wb[m]
    n=(N[I[t,0]]*w[:,0:1]+N[I[t,1]]*w[:,1:2]+N[I[t,2]]*w[:,2:3]); n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-20
    L=np.array(light,float); L=L[0]*r+L[1]*u+L[2]*f; L/=np.linalg.norm(L)
    d=np.clip(n@L,0,1)
    uv=(UV[I[t,0]]*w[:,0:1]+UV[I[t,1]]*w[:,1:2]+UV[I[t,2]]*w[:,2:3])
    th,tw=tex.shape[:2]
    x=np.clip((uv[:,0]%1.0)*tw,0,tw-1).astype(int); y=np.clip((uv[:,1]%1.0)*th,0,th-1).astype(int)
    c=tex[y,x].astype(np.float64)
    img=np.full((H,Wd,3),bg,np.float64); img[m]=c*(0.45+0.65*d)[:,None]
    im=Image.fromarray(np.clip(img,0,255).astype(np.uint8))
    if ss>1: im=im.resize((Wd//ss,H//ss),Image.LANCZOS)
    return im
