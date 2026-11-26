#!/usr/bin/env python3
"""Render the technical dossier Markdown to a Unicode PDF with ReportLab."""
from pathlib import Path
import re
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs' / 'PRESENTATION-TECHNIQUE.md'
OUTPUT = ROOT / 'docs' / 'PRESENTATION-TECHNIQUE.pdf'
pdfmetrics.registerFont(TTFont('Arial', '/System/Library/Fonts/Supplemental/Arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
S = getSampleStyleSheet()
S.add(ParagraphStyle(name='TitleFr', parent=S['Title'], fontName='Arial-Bold', fontSize=24, leading=29, textColor=colors.HexColor('#123C34'), alignment=TA_CENTER, spaceAfter=15))
S.add(ParagraphStyle(name='H1Fr', parent=S['Heading1'], fontName='Arial-Bold', fontSize=17, leading=21, textColor=colors.HexColor('#123C34'), spaceBefore=12, spaceAfter=7))
S.add(ParagraphStyle(name='H2Fr', parent=S['Heading2'], fontName='Arial-Bold', fontSize=12, leading=15, textColor=colors.HexColor('#B95524'), spaceBefore=9, spaceAfter=5))
S.add(ParagraphStyle(name='BodyFr', parent=S['BodyText'], fontName='Arial', fontSize=9.2, leading=13, spaceAfter=5))
S.add(ParagraphStyle(name='BulletFr', parent=S['BodyText'], fontName='Arial', fontSize=9, leading=12, leftIndent=13, firstLineIndent=-9, spaceAfter=3))
S.add(ParagraphStyle(name='SmallFr', parent=S['BodyText'], fontName='Arial', fontSize=7.2, leading=9))

def fmt(s):
    s = s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`(.+?)`', r'<font name="Arial-Bold">\1</font>', s)
    s = re.sub(r'\[(.+?)\]\((.+?)\)', r'\1', s)
    return s

def footer(canvas, doc):
    canvas.saveState(); w, _ = A4
    canvas.setStrokeColor(colors.HexColor('#D5DDD9')); canvas.line(18*mm,15*mm,w-18*mm,15*mm)
    canvas.setFont('Arial',7); canvas.setFillColor(colors.HexColor('#59645F'))
    canvas.drawString(18*mm,10*mm,'NkapLingua · Dossier technique · 27 novembre 2026')
    canvas.drawRightString(w-18*mm,10*mm,str(doc.page)); canvas.restoreState()

lines = SOURCE.read_text(encoding='utf-8').splitlines(); story=[]; i=0
while i < len(lines):
    line=lines[i].strip()
    if not line: i+=1; continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-{3,}:?',c) for c in cells): rows.append([Paragraph(fmt(c),S['SmallFr']) for c in cells])
            i+=1
        if rows:
            table=Table(rows,colWidths=[174*mm/len(rows[0])]*len(rows[0]),repeatRows=1)
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#123C34')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#CFD8D3')),('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F3F6F4')]),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
            story.extend([Spacer(1,3),table,Spacer(1,7)])
        continue
    if line.startswith('# '): story.append(Paragraph(fmt(line[2:]),S['TitleFr']))
    elif line.startswith('## '): story.append(Paragraph(fmt(line[3:]),S['H1Fr']))
    elif line.startswith('### '): story.append(Paragraph(fmt(line[4:]),S['H2Fr']))
    elif line.startswith('- '): story.append(Paragraph('• '+fmt(line[2:]),S['BulletFr']))
    elif re.match(r'^\d+\. ',line): story.append(Paragraph(fmt(line),S['BulletFr']))
    else: story.append(Paragraph(fmt(line),S['BodyFr']))
    i+=1
doc=SimpleDocTemplate(str(OUTPUT),pagesize=A4,rightMargin=18*mm,leftMargin=18*mm,topMargin=17*mm,bottomMargin=21*mm,title='NkapLingua — dossier technique de présentation',author='NkapLingua')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUTPUT)
