from PIL import Image,ImageOps,ImageEnhance,ImageDraw
from pathlib import Path
src=Path('/mnt/data');dst=Path(__file__).parent/'public'/'assets';dst.mkdir(parents=True,exist_ok=True)
# Crop coordinates chosen from provided source photos, avoiding unrelated people where possible.
entries={
'jack':('IMG_6523.png',(35,380,900,1700)),
'joe-d':('IMG_6527.jpeg',(230,270,1010,1370)),
'fish':('IMG_6437.jpeg',(160,40,920,1050)),
'ryan':('IMG_6522.png',(120,420,850,1620)),
'morris':('IMG_6525.jpeg',(95,105,1120,1430)),
'vic':('IMG_6526.jpeg',(120,65,1080,1450)),
'eric':('Screenshot 2026-11-19 at 1.01.13 PM.png',(9,16,285,370)),
'joey':('3eb2087c-9e30-4b97-a9c3-027402bdf7bc.jpeg',(20,230,720,1310)),
'jacob':('IMG_6399.jpeg',(415,175,1010,1050)),
'soly':('IMG_5698.jpeg',(118,245,645,1335)),
}
for pid,(p,rect) in entries.items():
 im=Image.open(src/p).convert('RGB');im=ImageOps.exif_transpose(im);im=im.crop(rect)
 # portrait 3:4, crop based on upper-centered face
 im=ImageOps.fit(im,(480,640),method=Image.Resampling.LANCZOS,centering=(0.5,0.32))
 im.save(dst/(pid+'.webp'),format='WEBP',quality=88,method=6)
 print(pid, (dst/(pid+'.webp')).stat().st_size)
logo=Image.open(src/'a_clean_high_resolution_circular_logo_profile_ico.png').convert('RGBA');logo=ImageOps.fit(logo,(380,380));logo.save(dst/'bta-logo.webp',format='WEBP',quality=88,method=6)
