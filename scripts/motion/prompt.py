from core import config, finish
p, out = config()
from tools.make_prompt import prompt
text = prompt(p['creature'], p['actionSentence'])
(out / 'prompt.txt').write_text(text)
finish(out, prompt=text)
