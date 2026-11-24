"""Preserve browser text geometry in the native Keynote-exported PowerPoint."""
import json
import sys
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
work = Path(sys.argv[1]) if len(sys.argv)>1 else root / '.submission-build/pptx'
source = json.loads((work / 'source.json').read_text())
ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
for prefix, uri in ns.items():
    ET.register_namespace(prefix, uri)
with zipfile.ZipFile(work / 'native.pptx') as original:
    with zipfile.ZipFile(root / 'docs/CampusTriage.pptx', 'w', zipfile.ZIP_DEFLATED) as output:
        for name in original.namelist():
            contents = original.read(name)
            if name.startswith('ppt/slides/slide') and name.endswith('.xml'):
                number = int(name.split('slide')[-1].split('.')[0])
                tree = ET.fromstring(contents)
                texts = [shape for shape in tree.findall('.//p:sp', ns) if shape.find('p:txBody', ns) is not None]
                assert len(texts) == len(source[number-1]['lines']), (number, len(texts))
                for shape, line in zip(texts, source[number-1]['lines']):
                    body = shape.find('p:txBody/a:bodyPr', ns)
                    body.attrib.update({'lIns':'0','rIns':'0','tIns':'0','bIns':'0','anchor':'t', 'wrap':'none'})
                    for paragraph in shape.findall('p:txBody/a:p', ns):
                        properties = paragraph.find('a:pPr', ns)
                        if properties is None:
                            properties = ET.Element('{'+ns['a']+'}pPr')
                            paragraph.insert(0, properties)
                        properties.attrib.update({'algn':'l','marL':'0','marR':'0','indent':'0'})
                    for run in shape.findall('.//a:rPr', ns):
                        run.set('spc', str(round(line.get('spacing', 0)*100)))
                    transform = shape.find('p:spPr/a:xfrm', ns)
                    if transform is not None:
                        transform.find('a:off', ns).attrib.update({'x':str(round(line['x']*12700)), 'y':str(round(line['y']*12700))})
                contents = ET.tostring(tree, encoding='utf-8', xml_declaration=True)
            output.writestr(name, contents)
print('PowerPoint text insets and character spacing aligned to the HTML source.')
