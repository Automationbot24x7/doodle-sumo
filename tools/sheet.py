"""Contact sheet: python tools/sheet.py out.png size img1 img2 ..."""
import sys
from PIL import Image

out, size, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB').resize((size, size)) for f in files]
cols = min(len(ims), 6)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * size, rows * size), 'white')
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * size, (i // cols) * size))
sheet.save(out)
print(out, sheet.size)
