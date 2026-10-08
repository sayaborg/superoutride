"""Sprites drawn here, not cut from a recording: lamp posts and floodlight masts."""
import numpy as np, cv2
from cutlib import publish, save_rgba, S
def lamp():
    h,w=400,72; im=np.zeros((h,w,3),np.uint8); m=np.zeros((h,w),np.uint8)
    pole=(150,152,150); dark=(95,98,96); head=(215,220,222)
    cv2.rectangle(im,(8,60),(13,399),pole,-1); cv2.rectangle(m,(8,60),(13,399),1,-1)
    cv2.rectangle(im,(12,60),(13,399),dark,-1)
    pts=np.array([[10,62],[14,30],[26,12],[44,6],[62,8]],np.int32)
    cv2.polylines(im,[pts],False,pole,4); cv2.polylines(m,[pts],False,1,4)
    cv2.rectangle(im,(50,6),(70,13),head,-1); cv2.rectangle(m,(50,6),(70,13),1,-1)
    cv2.rectangle(im,(6,380),(15,399),dark,-1); cv2.rectangle(m,(6,380),(15,399),1,-1)
    save_rgba(im,m,S+'spr/lamp-post.png'); publish('lamp-post',im,m,1.8,anchor=(10.5,399))
def mast():
    h,w=720,64; im=np.zeros((h,w,3),np.uint8); m=np.zeros((h,w),np.uint8)
    pole=(140,142,140); dark=(90,92,90); head=(225,228,230); frame=(70,72,72)
    cv2.rectangle(im,(29,70),(35,719),pole,-1); cv2.rectangle(m,(29,70),(35,719),1,-1); cv2.rectangle(im,(34,70),(35,719),dark,-1)
    cv2.rectangle(im,(6,8),(58,70),frame,-1); cv2.rectangle(m,(6,8),(58,70),1,-1)
    for r in range(3):
        for c in range(4):
            x=10+c*12; y=12+r*19; cv2.rectangle(im,(x,y),(x+8,y+13),head,-1)
    cv2.rectangle(im,(26,700),(38,719),dark,-1); cv2.rectangle(m,(26,700),(38,719),1,-1)
    save_rgba(im,m,S+'spr/light-mast.png'); publish('light-mast',im,m,1.6,anchor=(32,719))
lamp(); mast()
