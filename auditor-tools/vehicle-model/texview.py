# dense z-buffered render from texel positions: texview.py tex.png out.png view scale x0 x1 y0 y1
import sys,numpy as np
from PIL import Image
T=np.asarray(Image.open(sys.argv[1]).convert('RGB')); pm=np.load('/home/claude/work/out/posmap.npz'); cov=pm['cov']; P=pm['pos'][cov]; C=T[cov]
V={'left':([0,0,-1],[0,1,0]),'right':([0,0,1],[0,1,0]),'rear':([-1,0,0],[0,1,0]),'front':([1,0,0],[0,1,0]),'top':([0,0,1],[1,0,0]),'rl':([-0.5,0,-0.866],[0,1,0]),'rr':([-0.5,0,0.866],[0,1,0]),'fl':([0.5,0,-0.866],[0,1,0]),'fl2':([0.866,0,-0.5],[0,1,0])}
r,u=[np.array(a,float) for a in V[sys.argv[3]]]; f=np.cross(r,u); sc=float(sys.argv[4]); x0,x1,y0,y1=map(float,sys.argv[5:9])
X=P@r; Y=P@u; Z=P@f; ok=(X>x0)&(X<x1)&(Y>y0)&(Y<y1); X,Y,Z,C=X[ok],Y[ok],Z[ok],C[ok]
W=int((x1-x0)*sc); H=int((y1-y0)*sc); px=((X-x0)*sc).astype(int); py=(H-1-(Y-y0)*sc).astype(int); R=int(sys.argv[9]) if len(sys.argv)>9 else 2
zb=np.full(H*W,-1e9); img=np.full((H*W,3),70,np.uint8)
offs=[(a,b) for a in range(-R,R+1) for b in range(-R,R+1) if a*a+b*b<=R*R+1]
for a,b in offs:
    qx=px+a; qy=py+b; m=(qx>=0)&(qx<W)&(qy>=0)&(qy<H); np.maximum.at(zb,qy[m]*W+qx[m],Z[m])
for a,b in offs:
    qx=px+a; qy=py+b; m=(qx>=0)&(qx<W)&(qy>=0)&(qy<H); i=qy[m]*W+qx[m]; w=Z[m]>=zb[i]-1e-9; img[i[w]]=C[m][w]
Image.fromarray(img.reshape(H,W,3)).save(sys.argv[2]); print(H,W)
