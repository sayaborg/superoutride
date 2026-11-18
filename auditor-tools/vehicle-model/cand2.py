import sys, json, numpy as np
sys.path.insert(0,'/home/claude/work/scripts'); import rend, glbio, setview
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
import os
G=os.environ.get('NSR_G','/home/claude/work/out/honda-nsr500-1984-r2.glb')
pts,uv,nn=rend.geom(G,os.environ.get('NSR_GEOM','/home/claude/work/out/geom_final.npz'),n=10_000_000); pts=pts.astype(np.float64); nn=nn.astype(np.float64)
col=rend.colors(rend.base_tex(G,0),uv)
PAINT=np.array([[215,5,17],[32,46,131],[235,235,233]],float); LAMP=np.array([255,0,255],float)
d=np.abs(col[:,None,:]-PAINT[None]).max(2); role=np.where(d.min(1)<=8,d.argmin(1),3); role[np.abs(col-LAMP).max(1)<=8]=4      # 0..2 paints, 3 neutral, 4 lamp
luma=(col@np.array([0.30,0.59,0.11]))/255
try: PAL=json.load(open('/home/claude/superoutride/content/vehicle-picture-sources/nsr500-1984.json'))['palettes']['red-blue']
except Exception: PAL=[[0,0,0]]*14; LAMPOFF=(107,8,16)
_cy=[float(v) for v in os.environ.get('NSR_AXLE_Y','0.300,0.335').split(',')]
WF=dict(c=np.array([0,_cy[0],0.6901]),R=0.300,rim=0.217,hw=0.065); WR=dict(c=np.array([0,_cy[1],-0.6901]),R=0.335,rim=0.230,hw=0.090)
def spin_wheels(P,N,role,luma):
    global SPCOL
    keep=np.ones(len(P),bool); addP=[];addN=[];addL=[]; rng=np.random.default_rng(5)
    for w in (WF,WR):
        dy=P[:,1]-w['c'][1]; dz=P[:,2]-w['c'][2]; r=np.hypot(dy,dz)
        spoke=(r>0.075)&(r<w['rim']-0.012)&(np.abs(P[:,0])<0.035)&(luma<0.30)&(role==3); keep&=~spoke
        n=400000; rr=np.sqrt(rng.uniform(0.075**2,(w['rim']-0.010)**2,n)); a=rng.uniform(0,2*np.pi,n)
        for side in (1,-1):
            q=np.c_[np.full(n,0.012*side),w['c'][1]+rr*np.cos(a),w['c'][2]+rr*np.sin(a)]; addP.append(q); addN.append(np.tile([side,0,0],(n,1)).astype(float))
            addL.append(0.34+0.16*np.cos((rr-0.075)/(w['rim']-0.085)*np.pi*3))      # soft rings: the blur of spokes and their gaps
    P2=np.r_[P[keep],*addP]; N2=np.r_[N[keep],*addN]; role2=np.r_[role[keep],np.full(sum(len(a) for a in addP),3)]; luma2=np.r_[luma[keep],*addL]; SPCOL=np.r_[col[keep],*[np.repeat((a*255)[:,None],3,1) for a in addL]]; return P2,N2,role2,luma2
def bake(yawi,bank,o,S=4,F=240,W=128,H=112):
    P,N,R,Lm=(SP if o.get('spin') else (pts,nn,role,luma))
    th=2*np.pi*yawi/64; c,s=np.cos(th),np.sin(th); b=np.radians(bank); cb,sb=np.cos(b),np.sin(b)
    def rot(V,isP):
        x,y,z=V[:,0],V[:,1],V[:,2]; x,y=x*cb-y*sb,x*sb+y*cb            # lean about the ground line
        return np.c_[x*c+z*s,y,-x*s+z*c]
    Q=rot(P,1); Nv=rot(N,0); depth=Q[:,2]+6.0
    vx=-Q[:,0]; vy=Q[:,1]; px=np.round(W*S/2+F*S*vx/depth).astype(int); py=np.round(H*S-8*S-F*S*(vy-2.0)/depth-F*S*2.0/6.0).astype(int)
    ok=(px>=0)&(px<W*S)&(py>=0)&(py<H*S); idx=np.where(ok)[0]; order=idx[np.argsort(-depth[idx])]
    buf=np.full((H*S,W*S),-1,np.int64); buf[py[order],px[order]]=order; cov=buf>=0; i=buf[cov]
    n=Nv[i]*np.array([-1,1,-1]); n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-9       # view frame: x right, y up, z to the viewer
    n[n[:,2]<0]*=-1
    Lmn=np.array(o['main'],float); Lmn/=np.linalg.norm(Lmn); Lf=np.array([0.6,0.2,0.5]); Lf/=np.linalg.norm(Lf)
    diff=np.clip(n@Lmn,0,1); fill=np.clip(n@Lf,0,1); sky=0.5+0.5*n[:,1]
    sh=o['amb']+o['sky']*sky+o['mainw']*diff+o['fillw']*fill
    hv=Lmn+np.array([0,0,1]); hv/=np.linalg.norm(hv); spec=np.clip(n@hv,0,1)**o.get('shin',36)
    D=np.full((H*S,W*S),np.nan); D[cov]=depth[i]
    if o.get('hollow'):
        Dz=np.where(cov,D,0); 
        for sig in (0.0375*F*S/6,0.125*F*S/6):
            wgt=ndi.gaussian_filter(cov.astype(float),sig); bl=ndi.gaussian_filter(Dz,sig)/np.maximum(wgt,1e-6); hol=np.clip((D-bl)/0.10,0,0.55)[cov]; sh=sh*(1-o['hollow']*hol)
    edge=np.zeros(cov.shape,bool)
    if o.get('steps'):
        r=int(round(0.025*F*S/6)); Dn=np.where(cov,D,1e9); mn=ndi.minimum_filter(Dn,size=2*r+1); edge=cov&((D-mn)>o.get('stepdepth',0.12))
    shade=np.zeros(cov.shape); shade[cov]=sh; sp=np.zeros(cov.shape); sp[cov]=spec; ro=np.full(cov.shape,-1); ro[cov]=R[i]; lu=np.zeros(cov.shape); lu[cov]=Lm[i]
    if o.get('full'):
        C=(SPCOL if o.get('spin') else col)[i]; rgb=np.zeros(cov.shape+(3,)); rgb[cov]=np.clip(C*np.clip(sh,0,1.6)[:,None]*o.get('fullgain',1.0)+255*0.6*(spec[:,None]>0)*spec[:,None],0,255)
        cvf=cov.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S); rg=rgb.reshape(H,S,W,S,3).transpose(0,2,1,3,4).reshape(H,W,S*S,3)
        den=np.maximum(cvf.sum(2),1)[...,None]; outc=(rg.sum(2)/den).astype(np.uint8); rrf=ro.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S); bestf=np.stack([(rrf==k).sum(2) for k in range(5)],2).argmax(2)
        mk=(rrf==bestf[...,None])&cvf; dn=np.maximum(mk.sum(2),1)[...,None]; outr=((rg*mk[...,None]).sum(2)/dn).astype(np.uint8)       # mean colour of the texel's majority role only
        return np.where((cvf.mean(2)>=0.5)[...,None],outc,0),(cvf.mean(2)>=0.5),bestf,outr
    out=np.zeros((H,W),np.uint8)
    cv=cov.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S); rr=ro.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S); ss=shade.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S)
    pp=sp.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S); ll=lu.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S); ee=edge.reshape(H,S,W,S).transpose(0,2,1,3).reshape(H,W,S*S)
    solid=cv.mean(2)>=0.5
    cnt=np.stack([(rr==k).sum(2) for k in range(5)],2); best=cnt.argmax(2)
    m=(rr==best[...,None]); den=np.maximum(m.sum(2),1); s_=(ss*m).sum(2)/den; p_=(pp*m).sum(2)/den; l_=(ll*m).sum(2)/den; e_=(ee&m).sum(2)/den
    if o.get('steps'): s_=np.where(e_>o.get('share',0.5),s_*0.45,s_)
    t1,t2=o['cuts']; step=np.where((s_>t1)|(p_>o.get('speccut',9)),0,np.where(s_>t2,1,2))
    paint=solid&(best<3); out[paint]=(1+best*3+step)[paint]
    g=np.clip(l_*s_*o.get('gain',1.0),0,1)**o.get('gamma',1.0); gs=np.clip((g*5).astype(int),0,4); gs=np.where((p_>o.get('gspec',9)),np.minimum(gs+1,4),gs)
    neu=solid&(best==3); out[neu]=(10+gs)[neu]; out[solid&(best==4)]=15
    return out
def img(out,zoom=4,bg=(74,112,74)):
    if isinstance(out,tuple):
        rgbi,m=out[0],out[1]; a=np.where(m[...,None],rgbi,np.array(bg,np.uint8)); ys,xs=np.where(m); a=a[max(ys.min()-2,0):ys.max()+3,max(xs.min()-3,0):xs.max()+4]; return Image.fromarray(a.astype(np.uint8)).resize((a.shape[1]*zoom,a.shape[0]*zoom),Image.NEAREST)
    P=[bg]+[tuple(c) for c in PAL]+[LAMPOFF]; a=np.array(P,np.uint8)[out]; ys,xs=np.where(out>0); a=a[max(ys.min()-2,0):ys.max()+3,max(xs.min()-3,0):xs.max()+4]
    return Image.fromarray(a).resize((a.shape[1]*zoom,a.shape[0]*zoom),Image.NEAREST)
def row(cells,o,label,zoom=4):
    ims=[img(bake(y,b,o),zoom) for y,b in cells]; W=sum(i.width+8 for i in ims); H=max(i.height for i in ims)+14; r=Image.new('RGB',(W,H),(74,112,74)); x=0
    for i in ims: r.paste(i,(x,H-i.height)); x+=i.width+8
    ImageDraw.Draw(r).text((3,1),label,fill=(255,255,0)); return r
SP=spin_wheels(pts,nn,role,luma)
BASE=dict(main=(-0.40,0.70,0.59),amb=0.34,sky=0.18,mainw=0.68,fillw=0.10,cuts=(0.95,0.62),gamma=1.0,gain=1.0)
if __name__=='__main__':
    CANDS=json.load(open(sys.argv[1])); cells=[(0,0),(4,0),(8,0),(16,0),(24,0),(32,0),(0,-20),(0,-40)]
    rows=[]
    for name,o in CANDS.items():
        oo=dict(BASE); oo.update(o); rows.append(row(cells,oo,name))
    setview.stack(rows,sys.argv[2])
    