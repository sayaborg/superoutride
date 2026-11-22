import sys; sys.path.insert(0,'tools')
import view, rast, numpy as np
from PIL import Image, ImageDraw
def load(path):
    js,binb,P,UV,I,img=view.mesh(path); return P,UV,I,np.asarray(img(0).convert('RGB'))
P,UV,I,t1=load('out/porsche-928-s4-1987-v1.glb')
_,_,_,t2=load(sys.argv[1])
tag=sys.argv[2]
N=view.vnormals(P,I)
def lab(im,s):
    d=ImageDraw.Draw(im); d.rectangle([0,0,170,24],fill=(0,0,0)); d.text((8,6),s,fill=(255,255,255)); return im
vs=['side_r',rast.persp(35,18),'front','rear',rast.persp(150,22),rast.persp(215,30)]
ims=[rast.shade_uv(P,I,N,UV,t2,v,W=1000,ss=2) for v in vs]
c=Image.new('RGB',(2000,sum(max(ims[i].height,ims[i+1].height) for i in (0,2,4))),(40,40,40)); y=0
for i in (0,2,4):
    c.paste(ims[i],(0,y)); c.paste(ims[i+1],(1000,y)); y+=max(ims[i].height,ims[i+1].height)
c.save(f'out/928-{tag}-views.jpg',quality=90)
rows=[]
for v,box in [(rast.persp(150,22),(0.30,0.05,0.85,0.55)),(rast.persp(35,18),(0.15,0.0,0.75,0.45)),(rast.persp(180,12),(0.05,0.0,0.95,0.75))]:
    pair=[]
    for nmv,t in (('v1 (before)',t1),(f'{tag} (after)',t2)):
        im=rast.shade_uv(P,I,N,UV,t,v,W=2400,ss=1); W,H=im.size
        im=im.crop((int(box[0]*W),int(box[1]*H),int(box[2]*W),int(box[3]*H))); im=im.resize((1000,int(im.height*1000/im.width)),Image.LANCZOS)
        pair.append(lab(im,nmv))
    r=Image.new('RGB',(2000,pair[0].height)); r.paste(pair[0],(0,0)); r.paste(pair[1],(1000,0)); rows.append(r)
c=Image.new('RGB',(2000,sum(r.height for r in rows))); y=0
for r in rows: c.paste(r,(0,y)); y+=r.height
c.save(f'out/928-{tag}-glass-edges.jpg',quality=90)
