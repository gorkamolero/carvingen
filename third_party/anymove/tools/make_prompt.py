"""Write a two-camera video prompt for a creature from its creature.json and one action sentence.

python tools/make_prompt.py assets/dragon "the dragon rears up on its hind legs, spreads its wings wide and roars, then drops back onto all four legs." [out.txt]
python tools/make_prompt.py --check            rebuild every prompt under prompts/ and report any that differ

The prompt pins down what video models otherwise drift on: both halves are one moment from two locked cameras, the
model stays exactly as rendered, every limb keeps its colour, the body count is fixed, and the creature stays centred.
Only the action changes from move to move. creature.json gives the words: noun ("giant spider"), name ("spider"),
describe, colour_code, count, flank ("flank" or "side") and limbs ("legs" or "limbs").
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

TEMPLATE = (
    "Animate the exact {noun} game model shown twice in this split-screen image. Left: a front camera, the {name} faces "
    "the viewer. Right: a side camera on its right {flank}, the {name} faces right. Both are locked-off cameras filming "
    "the same {name} at the same moment, so every movement happens in both views at exactly the same time, frame for "
    "frame. Keep the model exactly as it is: {describe}. Its {limbs} are colour-coded and the colours never change or "
    "swap: {colour_code}. {count} Action: {action} It stays on the same spot, centred in both views. One continuous "
    "5-second shot at natural speed, no slow motion. The cameras never move, cut, pan or zoom; the plain grey studio "
    "background, the floor band and the dark vertical divider stay fixed."
)


def prompt(creature_dir, action):
    c = json.load(open(pathlib.Path(creature_dir) / "creature.json"))
    action = action.strip()
    if not action.endswith("."):
        action += "."
    return TEMPLATE.format(noun=c.get("noun", c["name"]), name=c["name"], flank=c.get("flank", "side"),
                           describe=c["describe"], limbs=c.get("limbs", "limbs"), colour_code=c["colour_code"],
                           count=c["count"], action=action)


def check():
    bad, hand = 0, 0
    files = sorted((ROOT / "prompts").rglob("*.txt"))
    for f in files:
        creature = f.relative_to(ROOT / "prompts").parts[0]
        text = f.read_text().strip()
        m = re.search(r"Action: (.*?) It stays on the same spot", text)
        if not m:   # written by hand before the template (the wolf's trot says "stays centred" inside its action)
            print("hand-written, kept as is:", f.relative_to(ROOT)); hand += 1; continue
        if prompt(ROOT / "assets" / creature, m.group(1)) != text:
            print("differs:", f.relative_to(ROOT)); bad += 1
    print(f"{len(files) - bad - hand} of {len(files)} prompts rebuild exactly, {hand} hand-written")
    return bad


if __name__ == "__main__":
    if sys.argv[1] == "--check":
        raise SystemExit(1 if check() else 0)
    text = prompt(sys.argv[1], sys.argv[2])
    if len(sys.argv) > 3:
        pathlib.Path(sys.argv[3]).parent.mkdir(parents=True, exist_ok=True)
        pathlib.Path(sys.argv[3]).write_text(text + "\n")
    print(text)
