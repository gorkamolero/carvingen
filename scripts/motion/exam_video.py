import json, sys
from pathlib import Path
import cv2
p=json.loads(Path(sys.argv[1]).read_text()); directory=Path(p['directory'])
writer=cv2.VideoWriter(str(directory/'exam.mp4'),cv2.VideoWriter_fourcc(*'mp4v'),24,(1536,768))
if not writer.isOpened(): raise ValueError('Cannot create exam video')
# Two identical periods provide enough source for the normal 3.5-second trim.
for _ in range(2):
    for i in range(48):
        frame=cv2.imread(str(directory/f'frame-{i:03d}.png'))
        if frame is None: raise ValueError('Missing exam frame')
        writer.write(frame)
writer.release()
