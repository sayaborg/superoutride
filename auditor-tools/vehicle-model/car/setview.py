import sys, json, numpy as np
from PIL import Image, ImageDraw
def load(p): return json.load(open(p))
def rgb555(v): return ((v>>10&31)*255//31,(v>>5&31)*255//31,(v&31)*255//31)
def pal(d,name,lamp='off'):
    c=[rgb555(v) for v in d['palettes'][name]]; return [(0,0,0)]+c+[rgb555(d['brakeLamp'][lamp])]
def frame(d,yaw,bank,size,palette,lamp='off',bg=(74,112,74)):
    s=d['pictures'][d['assets'][yaw][bank]]['sizes'][size]; P=pal(d,palette,lamp); W,H=s['width'],s['height']; im=np.zeros((H,W,3),np.uint8); im[:]=bg
    sh=s['shadow']; ox=int(round(s['anchorX']-sh['anchorX'])); oy=int(round(s['anchorY']-sh['anchorY']))
    for y,row in enumerate(sh['rows']):
        for x,ch in enumerate(row):
            if ch!='0' and 0<=y+oy<H and 0<=x+ox<W: im[y+oy,x+ox]=(np.array(bg)*0.55).astype(np.uint8)
    for y,row in enumerate(s['rows']):
        for x,ch in enumerate(row):
            k=int(ch,16)
            if k: im[y,x]=P[k]
    return Image.fromarray(im)
def strip(d,cells,size,palette,zoom,label=None,lamp='off',pad=None):
    ims=[frame(d,y,b,size,palette,lamp) for y,b in cells]; W=pad or max(i.width for i in ims); H=max(i.height for i in ims)
    out=Image.new('RGB',((W+2)*len(ims)*zoom,H*zoom+(14 if label else 0)),(74,112,74))
    for k,i in enumerate(ims): out.paste(i.resize((i.width*zoom,i.height*zoom),Image.NEAREST),(k*(W+2)*zoom+(W-i.width)*zoom//2,(H-i.height)*zoom+(14 if label else 0)))
    if label: ImageDraw.Draw(out).text((3,1),label,fill=(255,255,0))
    return out
def stack(rows,path):
    W=max(r.width for r in rows); H=sum(r.height+4 for r in rows); im=Image.new('RGB',(W,H),(30,30,30)); y=0
    for r in rows: im.paste(r,(0,y)); y+=r.height+4
    im.save(path); print(path,im.size)
if __name__=='__main__':
    out=sys.argv[1]; sets=[(a.split('/')[-1][:-5],load(a)) for a in sys.argv[2:]]
    yaws=[0,4,8,16,24,32]; rows=[]
    for n,d in sets:
        p=list(d['palettes'])[0]; mid=d['bankVariants']//2
        rows.append(strip(d,[(y,mid) for y in yaws],0,p,4,f'{n} / {p} / size 0 / yaw {yaws} (x4)'))
        rows.append(strip(d,[(0,b) for b in range(d['bankVariants'])],0,p,4,f'{n} / bank 0..{d["bankVariants"]-1} at yaw 0 (x4)'))
        rows.append(strip(d,[(0,mid)]*1,1,p,8,f'{n} / size 1 (x8)'))
    stack(rows,out)
