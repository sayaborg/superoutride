import sys,numpy as np
from PIL import Image
T=np.asarray(Image.open(sys.argv[1]).convert('RGB')); tag=sys.argv[2]; sc=1200; R=2
pm=np.load('/home/claude/work/out/posmap.npz'); cov=pm['cov']; P=pm['pos'][cov].astype(np.float64); N=pm['nor'][cov].astype(np.float64); N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-9; C=T[cov].astype(np.float32)
V={'left':([0,0,-1],(-1.1,1.1)),'right':([0,0,1],(-1.1,1.1)),'rear':([-1,0,0],(-0.55,0.55)),'front':([1,0,0],(-0.55,0.55))}
u=np.array([0,1.,0]); y0,y1=-0.04,1.40
for v,(r,(x0,x1)) in V.items():
    r=np.array(r,float); f=np.cross(r,u); X=P@r; Y=P[:,1]; Z=P@f
    l=f*0.75+u*0.6+r*0.25; l/=np.linalg.norm(l); sh=0.78+0.22*np.clip(N@l,0,1); col=np.clip(C*sh[:,None]*1.0,0,255).astype(np.uint8)
    W=int((x1-x0)*sc); H=int((y1-y0)*sc); px=((X-x0)*sc).astype(int); py=(H-1-(Y-y0)*sc).astype(int)
    zb=np.full(H*W,-1e9); img=np.full((H*W,3),150,np.uint8); offs=[(a,b) for a in range(-R,R+1) for b in range(-R,R+1) if a*a+b*b<=R*R+1]
    for a,b in offs:
        qx=px+a; qy=py+b; m=(qx>=0)&(qx<W)&(qy>=0)&(qy<H); np.maximum.at(zb,qy[m]*W+qx[m],Z[m])
    for a,b in offs:
        qx=px+a; qy=py+b; m=(qx>=0)&(qx<W)&(qy>=0)&(qy<H); i=qy[m]*W+qx[m]; w=Z[m]>=zb[i]-1e-9; img[i[w]]=col[m][w]
    Image.fromarray(img.reshape(H,W,3)).save(f'/home/claude/work/out/nsr500-new-{tag}{v}.png'); print(v,W,H)
