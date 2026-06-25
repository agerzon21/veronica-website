/**
 * Renders the final signed contract PDF.
 *
 * Inputs: the filled contract template (variables already substituted), both
 * signatures (Veronika's pre-stored image + the client's drawn signature
 * base64), and an audit record.
 *
 * Output: a PDF Buffer. The endpoint that calls this uploads the buffer
 * to Google Drive and attaches it to the confirmation email.
 *
 * Authored with createElement instead of JSX so this file can stay as a
 * plain .ts module — Vercel's serverless bundler picks up .ts files in
 * the api directory but silently skips .tsx, which would break the
 * import at runtime.
 */

import { createElement as h } from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { ContractTemplate } from '../src/data/contract-template.js';

// Brand palette — matches the website's gold + neutral palette.
const COLORS = {
  gold: '#c9a96e',
  text: '#2d2d2d',
  muted: '#7a7268',
  rule: '#e3d4b4',
  background: '#ffffff',
  auditBg: '#fafaf7',
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.background,
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontFamily: 'Helvetica',
    color: COLORS.text,
    fontSize: 10,
    lineHeight: 1.5,
  },

  brandLabel: {
    fontSize: 9,
    color: COLORS.gold,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 6,
  },
  brandRule: {
    width: 40,
    height: 1,
    backgroundColor: COLORS.gold,
    alignSelf: 'center',
    marginBottom: 18,
  },

  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 28,
  },

  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  paragraph: {
    fontSize: 10,
    marginBottom: 5,
    color: COLORS.text,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 12,
  },
  bullet: {
    width: 8,
    fontSize: 10,
    color: COLORS.gold,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
  },

  fieldRow: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    width: 150,
  },
  fieldValue: {
    fontSize: 10,
    flex: 1,
  },

  paragraphItalic: {
    fontFamily: 'Helvetica-Oblique',
  },
  paragraphBold: {
    fontFamily: 'Helvetica-Bold',
  },

  signatureSection: {
    marginTop: 24,
  },
  signatureRow: {
    flexDirection: 'row',
    marginBottom: 28,
    alignItems: 'flex-end',
  },
  signatureColumn: {
    flex: 1,
    marginRight: 16,
  },
  signatureLabel: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  signatureImage: {
    height: 48,
    objectFit: 'contain',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.text,
    marginTop: 8,
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 9,
    color: COLORS.text,
  },
  signatureDate: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 2,
  },
  signatureFallback: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 16,
    paddingTop: 16,
    color: COLORS.text,
  },

  auditPage: {
    backgroundColor: COLORS.auditBg,
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontFamily: 'Helvetica',
    fontSize: 9,
    lineHeight: 1.5,
  },
  auditTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  auditIntro: {
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: 24,
    lineHeight: 1.6,
  },
  auditRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.rule,
  },
  auditKey: {
    width: 130,
    fontSize: 9,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  auditValue: {
    flex: 1,
    fontSize: 9,
    color: COLORS.text,
  },
  hmacRow: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.rule,
  },
  hmacLabel: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  hmacValue: {
    fontSize: 8,
    fontFamily: 'Courier',
    color: COLORS.text,
  },

  footer: {
    position: 'absolute',
    bottom: 32,
    left: 56,
    right: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLeft: {
    fontSize: 8,
    color: COLORS.muted,
  },
  footerRight: {
    fontSize: 8,
    color: COLORS.muted,
  },
});

export interface AuditRecord {
  signer_name: string;
  signer_email: string;
  signed_at: string;
  signer_ip: string;
  signer_user_agent: string;
  hmac: string;
}

export interface ContractPdfInput {
  filled: ContractTemplate;
  photographerSignaturePng: string | null;
  photographerName: string;
  clientSignaturePng: string;
  clientName: string;
  audit: AuditRecord;
}

function renderParagraphs(section: ContractTemplate['sections'][number]) {
  return section.paragraphs
    .map((p, idx) => {
      if (p.kind === 'text') {
        const emphasisStyle =
          p.emphasis === 'italic'
            ? styles.paragraphItalic
            : p.emphasis === 'bold'
              ? styles.paragraphBold
              : undefined;
        return h(
          Text,
          {
            key: idx,
            style: emphasisStyle ? [styles.paragraph, emphasisStyle] : styles.paragraph,
          },
          p.text,
        );
      }
      if (p.kind === 'bullets') {
        return h(
          View,
          { key: idx },
          p.items.map((item, i) =>
            h(
              View,
              { key: i, style: styles.bulletRow },
              h(Text, { style: styles.bullet }, '•'),
              h(Text, { style: styles.bulletText }, item),
            ),
          ),
        );
      }
      if (p.kind === 'fields') {
        return h(
          View,
          { key: idx },
          p.items.map((f, i) =>
            h(
              View,
              { key: i, style: styles.fieldRow },
              h(Text, { style: styles.fieldLabel }, `${f.label}:`),
              h(Text, { style: styles.fieldValue }, f.value),
            ),
          ),
        );
      }
      return null;
    })
    .filter(Boolean);
}

function renderFooter(label: string) {
  return h(
    View,
    { style: styles.footer, fixed: true },
    h(Text, { style: styles.footerLeft }, label),
    h(Text, {
      style: styles.footerRight,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Page ${pageNumber} of ${totalPages}`,
    }),
  );
}

function buildContractDocument(input: ContractPdfInput) {
  const sectionsWithoutSignature = input.filled.sections.filter(
    (s) => !s.paragraphs.some((p) => p.kind === 'signature_block'),
  );
  const dateLabel = new Date(input.audit.signed_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sectionNodes = sectionsWithoutSignature.map((section, idx) =>
    h(
      View,
      { key: idx, style: styles.section, wrap: false },
      h(
        Text,
        { style: styles.sectionTitle },
        `${section.number ? `${section.number}. ` : ''}${section.title}`,
      ),
      ...renderParagraphs(section),
    ),
  );

  const photographerSignatureNode = input.photographerSignaturePng
    ? h(Image, {
        src: input.photographerSignaturePng,
        style: styles.signatureImage,
      })
    : h(Text, { style: styles.signatureFallback }, `/s/ ${input.photographerName}`);

  const signatureBlock = h(
    View,
    { style: styles.signatureSection, wrap: false },
    h(Text, { style: styles.sectionTitle }, 'XIII. SIGNATURES'),
    h(
      View,
      { style: styles.signatureRow },
      h(
        View,
        { style: styles.signatureColumn },
        h(Text, { style: styles.signatureLabel }, 'Client Signature'),
        h(Image, { src: input.clientSignaturePng, style: styles.signatureImage }),
        h(View, { style: styles.signatureLine }),
        h(Text, { style: styles.signatureName }, input.clientName),
        h(Text, { style: styles.signatureDate }, dateLabel),
      ),
      h(
        View,
        { style: styles.signatureColumn },
        h(Text, { style: styles.signatureLabel }, 'Photographer Signature'),
        photographerSignatureNode,
        h(View, { style: styles.signatureLine }),
        h(Text, { style: styles.signatureName }, input.photographerName),
        h(Text, { style: styles.signatureDate }, dateLabel),
      ),
    ),
  );

  const contractPage = h(
    Page,
    { size: 'A4', style: styles.page },
    h(Text, { style: styles.brandLabel }, 'VERO PHOTOGRAPHY'),
    h(View, { style: styles.brandRule }),
    h(Text, { style: styles.title }, input.filled.title),
    ...sectionNodes,
    signatureBlock,
    renderFooter('Vero Photography'),
  );

  const auditRow = (label: string, value: string) =>
    h(
      View,
      { style: styles.auditRow, key: label },
      h(Text, { style: styles.auditKey }, label),
      h(Text, { style: styles.auditValue }, value),
    );

  const auditPage = h(
    Page,
    { size: 'A4', style: styles.auditPage },
    h(Text, { style: styles.brandLabel }, 'VERO PHOTOGRAPHY'),
    h(View, { style: styles.brandRule }),
    h(Text, { style: styles.auditTitle }, 'Audit Trail'),
    h(
      Text,
      { style: styles.auditIntro },
      'This record is included to evidence the electronic signature on the attached contract, as contemplated by the U.S. ESIGN Act (15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act.',
    ),
    auditRow('Signer Name', input.audit.signer_name),
    auditRow('Signer Email', input.audit.signer_email),
    auditRow('Signed At', new Date(input.audit.signed_at).toUTCString()),
    auditRow('Signer IP', input.audit.signer_ip),
    auditRow('Signer Device', input.audit.signer_user_agent),
    h(
      View,
      { style: styles.hmacRow },
      h(Text, { style: styles.hmacLabel }, 'Tamper-Evident Signature (HMAC-SHA-256)'),
      h(Text, { style: styles.hmacValue }, input.audit.hmac),
    ),
    renderFooter('Vero Photography — Audit Trail'),
  );

  return h(Document, null, contractPage, auditPage);
}

export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return renderToBuffer(buildContractDocument(input));
}
