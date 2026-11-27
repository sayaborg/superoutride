"""Nissan 300ZX 2+2 1984: write the GLB. Variant 'civil': one paint key. Variant 'police': the same body, two paint keys (body, doors and roof),
a star on the front doors and a light bar on the roof (K 2026-11-26)."""
import sys,io,os,hashlib,time; sys.path.insert(0,'tools')
import glbio, ao, numpy as np
from PIL import Image
from scipy import ndimage as ndi
VAR=sys.argv[1]; NAME='nissan-300zx-2plus2-1984' if VAR=='civil' else 'nissan-300zx-2plus2-police-1984'; OUT='out/%s.glb'%NAME
P0=(200,20,26); GLASS=(10,10,12); MATTE=(22,22,24); BRAKE=(255,0,255)
BODY=(214,30,30); WHITE=(236,236,232); GOLD=(214,164,44); GOLD2=(150,104,24); LENS=(240,20,10); BARC=(196,198,202); FOOT=(60,60,64)
js,binb=glbio.load('in/z31-src.glb'); prim=js['meshes'][0]['primitives'][0]
w=np.load('work/weld.npz'); inv=w['inv']; J=w['J']; X=np.load('work/X4.npy')
I=glbio.acc(js,binb,prim['indices']).reshape(-1,3).astype(np.int64)
fn=np.cross(X[J[:,1]]-X[J[:,0]],X[J[:,2]]-X[J[:,0]]); N=np.zeros_like(X)
for i in range(3): np.add.at(N,J[:,i],fn)
N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-20
P=X[inv].astype('<f4'); Nv=N[inv].astype('<f4'); UV=glbio.acc(js,binb,prim['attributes']['TEXCOORD_0']).astype('<f4').copy()
tex=np.load('work/tex1.npy').copy(); cls=np.load('work/cls1.npy').copy(); r=np.load('work/uvraster.npz'); tb=r['tb'].astype(np.int64); wb=r['wb'].astype(np.float64); cov=tb>=0; T=4096
pos=np.load('work/texpos.npy'); nrm=np.load('work/texnrm.npy'); x,y,zz=pos[...,0],pos[...,1],pos[...,2]
brake=(tex==BRAKE).all(2)&cov
gloss=np.isin(cls,(1,3,6))|brake; keys=[P0,LENS]; I2=I; extra_note=''
if VAR=='police':
    paint=cls==1
    door=paint&(np.abs(x)>0.6)&(zz<0.57)&(zz>-0.72)&(y<=0.87)        # the doors, from seam to seam, below the belt
    roof=paint&(zz<0.45)&(zz>-1.25)&(y>1.17)                               # the roof: the T-bar and the frame round the glass panels
    white=door|roof; tex[paint&~white]=BODY; tex[white]=WHITE; cls[white]=4; keys=[BODY,WHITE]
    print('police: body texels %d, doors %d, roof and pillars %d'%(int((paint&~white).sum()),int(door.sum()),int((roof&~door).sum())))
    # the star on each front door: a six-pointed star in a ring, gold (auditor's own figure; no agency's badge or lettering)
    zc,yc,R=-0.06,0.675,0.1875; u=zz-zc; v=y-yc; rho=np.hypot(u,v); th=np.arctan2(v,u)
    side=cov&(np.abs(nrm[...,0])>0.35)&(np.abs(x)>0.7)&(rho<R+0.01)&white
    k=6; a_=np.mod(th-np.pi/2,2*np.pi/k)-np.pi/k; rs=0.58*R*np.cos(np.pi/k)/np.cos(np.abs(a_)*1.0)                # hexagon edge
    tip=0.58*R/(np.cos(a_)+np.sin(np.abs(a_))*np.tan(np.pi/2-np.pi/k*1.0))*1.72
    star=rho<np.minimum(np.maximum(rs,0),1e9)                                                                  # the inner hexagon
    star|=rho<0.86*R*np.clip(1-np.abs(a_)/(np.pi/k)*0.62,0,1)                                                  # six points
    ring=(rho>0.90*R)&(rho<R); disc=rho<0.20*R
    em=side&(star|ring)&~disc; tex[em]=GOLD; tex[side&disc]=GOLD2; cls[side&disc]=0; cls[em]=5; keys=[BODY,WHITE,GOLD,LENS]
    print('door stars: texels %d, centre z %.2f y %.2f radius %.3f m'%(int((side&(star|ring|disc)).sum()),zc,yc,R))
    gloss=np.isin(cls,(1,3,4,5,6))|brake
    # the light bar: five boxes on the roof; their colours live in unused texels
    free=ndi.binary_erosion(~cov,np.ones((41,41))); fr_=np.argwhere(free); assert len(fr_)>5
    spots=[fr_[len(fr_)*(i+1)//7] for i in range(5)]
    crown=float(X[(np.abs(X[:,0])<0.05)&(np.abs(X[:,2]+1.02)<0.05),1].max()); edge=float(X[(np.abs(np.abs(X[:,0])-0.46)<0.03)&(np.abs(X[:,2]+1.02)<0.05)&(X[:,1]>1.2),1].max())
    y0=crown+0.012; zc_=-1.02
    boxes=[((-0.14,0.14),(y0,y0+0.115),(zc_-0.13,zc_+0.13),BARC,0.3),((0.14,0.52),(y0,y0+0.135),(zc_-0.14,zc_+0.14),LENS,0.1),((-0.52,-0.14),(y0,y0+0.135),(zc_-0.14,zc_+0.14),LENS,0.1),
           ((0.43,0.49),(edge-0.03,y0),(zc_-0.05,zc_+0.05),FOOT,0.9),((-0.49,-0.43),(edge-0.03,y0),(zc_-0.05,zc_+0.05),FOOT,0.9)]
    Vn=[];Nn=[];Un=[];In=[]; n0=len(P); boxrough=[]
    for (bx,by,bz,col,rough),(ty_,tx_) in zip(boxes,spots):
        tex[ty_-18:ty_+19,tx_-18:tx_+19]=col; boxrough.append((ty_,tx_,rough))
        c=np.array([[bx[i],by[j],bz[k]] for i in (0,1) for j in (0,1) for k in (0,1)],float)
        faces=[((0,1,3,2),(-1,0,0)),((4,6,7,5),(1,0,0)),((0,4,5,1),(0,-1,0)),((2,3,7,6),(0,1,0)),((0,2,6,4),(0,0,-1)),((1,5,7,3),(0,0,1))]
        for q,nn in faces:
            b=n0+len(Vn); Vn+=[c[i] for i in q]; Nn+=[nn]*4; Un+=[((tx_+0.5)/T,(ty_+0.5)/T)]*4
            v0,v1,v2=c[q[0]],c[q[1]],c[q[2]]; flip=np.dot(np.cross(v1-v0,v2-v0),nn)<0
            In+=[[b,b+2,b+1],[b,b+3,b+2]] if flip else [[b,b+1,b+2],[b,b+2,b+3]]
    P=np.vstack([P,np.array(Vn,'<f4')]); Nv=np.vstack([Nv,np.array(Nn,'<f4')]); UV=np.vstack([UV,np.array(Un,'<f4')]); I2=np.vstack([I,np.array(In)])
    print('light bar: roof crown %.4f, at x 0.46 %.4f | bar y %.4f..%.4f, x +-0.52, z %.2f..%.2f | %d vertices, %d triangles added'%(crown,edge,y0,y0+0.135,zc_-0.14,zc_+0.14,len(Vn),len(In)))
    extra_note='; police: paint on the doors and above the belt line takes the second key (white), the rest the first; a six-pointed star in a ring on each front door, 0.375 m across, is the third key (gold; a figure drawn by the auditor, no agency badge or lettering); a light bar of five boxes on the roof (two red lenses in the fourth key, a centre housing, two feet), the body otherwise vertex for vertex the civil model'
d_,ind=ndi.distance_transform_edt(~cov,return_indices=True); pad=(~cov)&(d_<=8)
if VAR=='police':
    for ty_,tx_,_ in boxrough: pad[ty_-18:ty_+19,tx_-18:tx_+19]=False
tex[pad]=tex[ind[0][pad],ind[1][pad]]
# supplied texels close to a key or the glass must not be read as one
kcls={0:1,1:4,2:5,3:6} if VAR=='police' else {0:1,1:6}
for i,kc in enumerate(keys):
    near=(np.abs(tex.astype(int)-np.array(kc)).max(2)<=8)&cov&(cls!=kcls[i])
    print('supplied texels within 8 of key %d %s, darkened by 20: %d'%(i+1,kc,int(near.sum()))); tex[near]=np.clip(tex[near].astype(int)-20,0,255)
ng=(np.abs(tex.astype(int)-np.array(GLASS)).max(2)<=4)&cov&(cls!=3); print('texels within 4 of the glass that are not it -> matte:',int(ng.sum())); tex[ng]=MATTE
def image(k):
    bv=js['bufferViews'][js['images'][k]['bufferView']]; o=bv.get('byteOffset',0); return np.array(Image.open(io.BytesIO(bytes(binb[o:o+bv['byteLength']]))).convert('RGB'))
mat=js['materials'][0]; ib=js['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']; im=js['textures'][mat['pbrMetallicRoughness']['metallicRoughnessTexture']['index']]['source']
M=image(im).copy(); dark=(tex.max(2)<72)&~gloss
M[...,1][dark]=230; M[...,1][gloss]=26
if VAR=='police':
    for ty_,tx_,rough in boxrough: M[ty_-18:ty_+19,tx_-18:tx_+19]=(255,int(rough*255),0)
for k,nm in ((1,'paint key 1'),(4,'paint key 2'),(5,'paint key 3'),(3,'glass'),(2,'matte black')): print('texels',nm,int(((cls==k)&cov).sum()))
print('texels brake lamp',int(brake.sum()))
t0=time.time(); Pd=P.astype(np.float64); A=np.empty(len(P))
for s in range(0,len(P),200000): A[s:s+200000]=ao.ao(Pd,Nv.astype(np.float64),I2,np.arange(s,min(len(P),s+200000)),192)
print('occlusion',round(time.time()-t0),'s, mean',A.mean().round(3))
# single vertices far darker than everything round them (a ray start caught under a stray sliver of the model) take their neighbours' mean
import scipy.sparse as sp
nw=len(X); Aw=np.zeros(nw); cw=np.zeros(nw); np.add.at(Aw,inv,A[:len(inv)]); np.add.at(cw,inv,1); Aw/=cw
E=np.concatenate([J[:,[0,1]],J[:,[1,2]],J[:,[2,0]]]); Adj=sp.coo_matrix((np.ones(len(E)*2),(np.concatenate([E[:,0],E[:,1]]),np.concatenate([E[:,1],E[:,0]]))),shape=(nw,nw)).tocsr(); Adj.data[:]=1.0
deg=np.asarray(Adj.sum(1)).ravel(); fixed=0
for _ in range(2):
    m1=(Adj@Aw)/np.maximum(deg,1); m2=(Adj@m1)/np.maximum(deg,1); bad=(Aw<0.6*m2)&(m2>0.5); Aw[bad]=m2[bad]; fixed+=int(bad.sum())
print('occlusion: %d lone dark vertices raised to their surroundings'%fixed); A[:len(inv)]=Aw[inv]
O=np.ones(tex.shape[:2]); O[cov]=np.einsum('nk,nk->n',wb[cov],A[I[tb[cov]]]); O[pad]=O[ind[0][pad],ind[1][pad]]
O8=np.clip(np.round(O*255),0,255).astype(np.uint8); OC=np.stack([O8]*3,2)
def png(a):
    bio=io.BytesIO(); Image.fromarray(a).save(bio,'PNG'); return bio.getvalue()
# the triangles are written in Morton order of their centres, so the baker's area-run sampling spreads evenly.
# the file's mesh: K's model has 4.9 million triangles (a file over GitHub's 100 MB); it is thinned to 2 million by removing vertices,
# none moved, the borders of the texture's pieces kept (meshoptimizer, attributes: texture coordinates and normals). Both variants take the same thinned body.
nb=len(inv)
if not os.path.exists('work/simp.npy'):
    import subprocess
    os.makedirs('work/simp',exist_ok=True); Pb=X[inv].astype('<f4'); Nb=N[inv].astype('<f4'); UVb=glbio.acc(js,binb,prim['attributes']['TEXCOORD_0']).astype('<f4')
    I.astype('<u4').tofile('work/simp/idx.u32'); Pb.tofile('work/simp/pos.f32'); np.hstack([UVb,Nb*0.5]).astype('<f4').tofile('work/simp/att.f32')
    print(subprocess.run(['node','simp/simp.mjs','work/simp','2000000','1'],capture_output=True,text=True,env={**os.environ,'PATH':'/home/claude/node24/node_modules/.bin:'+os.environ['PATH']}).stdout.strip())
    Is_=np.fromfile('work/simp/out.u32','<u4').reshape(-1,3).astype(np.int64); c_=(Pb[Is_[:,0]]+Pb[Is_[:,1]]+Pb[Is_[:,2]]).astype(np.float64)/3; q_=np.floor((c_-c_.min(0))/0.002).astype(np.uint64)
    def spread(v):
        v=v&np.uint64(0x1fffff); v=(v|(v<<np.uint64(32)))&np.uint64(0x1f00000000ffff); v=(v|(v<<np.uint64(16)))&np.uint64(0x1f0000ff0000ff)
        v=(v|(v<<np.uint64(8)))&np.uint64(0x100f00f00f00f00f); v=(v|(v<<np.uint64(4)))&np.uint64(0x10c30c30c30c30c3); v=(v|(v<<np.uint64(2)))&np.uint64(0x1249249249249249); return v
    np.save('work/simp.npy',Is_[np.argsort(spread(q_[:,0])|(spread(q_[:,1])<<np.uint64(1))|(spread(q_[:,2])<<np.uint64(2)),kind='stable')])
Is=np.load('work/simp.npy'); Iw=np.vstack([Is,I2[len(I):]]); used=np.unique(Iw); remap=np.full(len(P),-1,np.int64); remap[used]=np.arange(len(used))
bodyv=np.zeros(nb,bool); bodyv[np.unique(Is)]=True
print('thinned: triangles %d -> %d, vertices %d -> %d | sha256 of the kept body vertices\' positions %s'%(len(I),len(Is),nb,int(bodyv.sum()),hashlib.sha256(P[:nb][bodyv].tobytes()).hexdigest()[:16]))
P=P[used]; Nv=Nv[used]; UV=UV[used]; I2=remap[Iw]
ia=js['accessors'][prim['indices']]; assert ia['componentType']==5125
repl={js['accessors'][prim['attributes']['POSITION']]['bufferView']:P.tobytes(),js['accessors'][prim['attributes']['NORMAL']]['bufferView']:Nv.tobytes(),ia['bufferView']:I2.astype('<u4').tobytes(),js['accessors'][prim['attributes']['TEXCOORD_0']]['bufferView']:UV.tobytes(),
      js['images'][ib]['bufferView']:png(tex),js['images'][im]['bufferView']:png(M)}
ia['count']=int(I2.size); ia['max']=[int(I2.max())]
for _k in ('POSITION','NORMAL','TEXCOORD_0'): js['accessors'][prim['attributes'][_k]]['count']=len(P)
a=js['accessors'][prim['attributes']['POSITION']]; a['min']=[float(v) for v in P.min(0)]; a['max']=[float(v) for v in P.max(0)]
for k,nm in ((ib,NAME+'_basecolor.png'),(im,'metallic_roughness.png')): js['images'][k]['mimeType']='image/png'; js['images'][k]['name']=nm
out=bytearray()
for i in sorted(range(len(js['bufferViews'])),key=lambda i:js['bufferViews'][i].get('byteOffset',0)):
    v=js['bufferViews'][i]; o=v.get('byteOffset',0); data=repl.get(i,bytes(binb[o:o+v['byteLength']]))
    while len(out)%4: out.append(0)
    v['byteOffset']=len(out); v['byteLength']=len(data); out+=data
while len(out)%4: out.append(0)
p=png(OC); js['bufferViews'].append({'buffer':0,'byteOffset':len(out),'byteLength':len(p)}); out+=p
js['images'].append({'name':'occlusion.png','mimeType':'image/png','bufferView':len(js['bufferViews'])-1}); js['textures'].append({'source':len(js['images'])-1,'sampler':0})
mat['occlusionTexture']={'index':len(js['textures'])-1}; js['buffers'][0]['byteLength']=len(out)+(-len(out))%4
ex=dict(np.load('work/wheel_extras.npy',allow_pickle=True).item()); body=np.load('work/body.npy')
node=js['nodes'][0]; node['name']=NAME
pk={'body':list(keys[0]),'rearLens':list(LENS)}
if VAR=='police': pk['doorsAndRoof']=list(WHITE); pk['doorStar']=list(GOLD); pk['roofLamp']=list(LENS)
node['extras']={'source':'K, Tripo model e5a1d3a5-b922-4ee7-a498-eb560a93162b.glb, fitted by Claude 2026-11-27','vehicle':'Nissan 300ZX 2+2 1984 (Z31, KHLG-JU), US non-California, T-bar roof, GL, VG30E, five-speed manual',
 'units':'m','up':'+y','forward':'+z','left':'+x','origin':'ground, mid-wheelbase, centerline',
 'overall':{'length':round(float(X[:,2].max()-X[:,2].min()),4),'width':round(float(X[body,0].max()-X[body,0].min()),4),'width_with_mirrors':round(float(X[:,0].max()-X[:,0].min()),4),'height':round(float(X[:,1].max()),4),'height_with_light_bar':round(float(P[:,1].max()),4),'wheelbase':2.520,'front_track':1.415,'rear_track':1.435},
 'paint':{**pk,'window':list(GLASS),'matteBlack':list(MATTE),'brakeLamp':list(BRAKE)},**{'wheel_'+k:v for k,v in ex.items()},
 'reflectance':{'roughness':{'paints':0.1,'glass':0.1,'brake_lamp':0.1,'black_parts':0.9}},
 'occlusion':{'note':'occlusion texture, R: the share of its surroundings a point sees, cosine-weighted, 96 directions a side; computed at the vertices'},
 'note':'sized to Nissan\'s 1984 300ZX service manual, GI-13, 2+2 seater: length 4,535 mm, wheelbase 2,520 mm, overhangs 945 and 1,070 mm, width 1,725 mm (with side molding, one width scale), treads 1,415 and 1,435 mm; the height scale is the tyres\' (P215/60R15, 0.639 m in diameter), which gives a height of 1.307 m (the manual: 1,310 mm); the bonnet\'s turbo scoop is taken off, the left half taking the right half\'s height (K chose the non-turbo car); tyres round at the treads, standing on the road; the windscreen, the hatch glass and the two quarter windows glass and made flat, the door glass and the T-bar roof\'s panels glass as supplied; brake lamps are the red upper lenses of the rear lamps; the strip joining them is a red lens that does not light, a key of its own (K); the two black squares on the roof and the badge on the hatch\'s right are painted over (K); badges, lettering, lamps, mouldings and wheels as supplied; dark parts matte black; the mesh is thinned from 4.8 to 2.0 million triangles without moving a vertex, written in Morton order'}
glbio.save(OUT,js,out); print(OUT,round(os.path.getsize(OUT)/1e6,1),'MB',hashlib.sha256(open(OUT,'rb').read()).hexdigest())
print('measured on the file: length %.4f height %.4f width %.4f | vertices %d triangles %d'%(P[:,2].max()-P[:,2].min(),P[:,1].max(),P[:,0].max()-P[:,0].min(),len(P),len(I2)))
np.save('work/tex-%s.npy'%VAR,tex)
