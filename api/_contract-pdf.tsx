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
 * Visual idiom matches the rest of the brand — light cream background,
 * gold accents, Helvetica-family typography. An "Audit Trail" page is
 * appended so the legal trail is visible when the PDF is printed or
 * forwarded.
 */

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

  // Header band — small caps brand name + thin gold rule
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

  // Document title
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 28,
  },

  // Section
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

  // Fields (label/value rows)
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

  // Emphasis variants for plain text
  paragraphItalic: {
    fontFamily: 'Helvetica-Oblique',
  },
  paragraphBold: {
    fontFamily: 'Helvetica-Bold',
  },

  // Signature block
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

  // Audit page
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
  signed_at: string;        // ISO timestamp
  signer_ip: string;
  signer_user_agent: string;
  hmac: string;             // tamper-evident audit signature
}

export interface ContractPdfInput {
  filled: ContractTemplate;
  // Pre-stored Veronika signature. Pass as base64 PNG (data:image/png;base64,…)
  // OR as null to fall back to a typed "/s/ Veronika Polbina" rendering.
  photographerSignaturePng: string | null;
  photographerName: string;
  // Client signature drawn in the portal. Base64 PNG data URL.
  clientSignaturePng: string;
  clientName: string;
  audit: AuditRecord;
}

// Renders a section's paragraphs (text + bullets), skipping the signature
// block which we render separately at the end.
function SectionParagraphs({ section }: { section: ContractTemplate['sections'][number] }) {
  return (
    <>
      {section.paragraphs.map((p, idx) => {
        if (p.kind === 'text') {
          const emphasisStyle =
            p.emphasis === 'italic'
              ? styles.paragraphItalic
              : p.emphasis === 'bold'
                ? styles.paragraphBold
                : undefined;
          return (
            <Text key={idx} style={[styles.paragraph, emphasisStyle].filter(Boolean)}>
              {p.text}
            </Text>
          );
        }
        if (p.kind === 'bullets') {
          return (
            <View key={idx}>
              {p.items.map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (p.kind === 'fields') {
          return (
            <View key={idx}>
              {p.items.map((f, i) => (
                <View key={i} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{f.label}:</Text>
                  <Text style={styles.fieldValue}>{f.value}</Text>
                </View>
              ))}
            </View>
          );
        }
        return null;
      })}
    </>
  );
}

function ContractDocument(input: ContractPdfInput) {
  const sectionsWithoutSignature = input.filled.sections.filter(
    (s) => !s.paragraphs.some((p) => p.kind === 'signature_block'),
  );
  const dateLabel = new Date(input.audit.signed_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Brand header */}
        <Text style={styles.brandLabel}>VERO PHOTOGRAPHY</Text>
        <View style={styles.brandRule} />

        {/* Document title */}
        <Text style={styles.title}>{input.filled.title}</Text>

        {/* Body sections */}
        {sectionsWithoutSignature.map((section, idx) => (
          <View key={idx} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>
              {section.number ? `${section.number}. ` : ''}
              {section.title}
            </Text>
            <SectionParagraphs section={section} />
          </View>
        ))}

        {/* Signatures — both side by side. Photographer's signature is the
            pre-stored image if available, otherwise a typed "/s/ Name"
            rendering. Client's signature is the canvas drawing. */}
        <View style={styles.signatureSection} wrap={false}>
          <Text style={styles.sectionTitle}>XIII. SIGNATURES</Text>
          <View style={styles.signatureRow}>
            {/* Client */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>Client Signature</Text>
              <Image src={input.clientSignaturePng} style={styles.signatureImage} />
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{input.clientName}</Text>
              <Text style={styles.signatureDate}>{dateLabel}</Text>
            </View>

            {/* Photographer */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>Photographer Signature</Text>
              {input.photographerSignaturePng ? (
                <Image
                  src={input.photographerSignaturePng}
                  style={styles.signatureImage}
                />
              ) : (
                // Text-based fallback. /s/ is the standard convention for
                // typed-signature representation in US legal documents.
                <Text
                  style={{
                    fontFamily: 'Helvetica-Oblique',
                    fontSize: 16,
                    paddingTop: 16,
                    color: COLORS.text,
                  }}
                >
                  /s/ {input.photographerName}
                </Text>
              )}
              <View style={styles.signatureLine} />
              <Text style={styles.signatureName}>{input.photographerName}</Text>
              <Text style={styles.signatureDate}>{dateLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>Vero Photography</Text>
          <Text
            style={styles.footerRight}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* Audit trail — the legal "how this was signed" record. ESIGN/UETA
          require this kind of audit log to be retained alongside the
          signed document. HMAC at the bottom makes the record
          tamper-evident. */}
      <Page size="A4" style={styles.auditPage}>
        <Text style={styles.brandLabel}>VERO PHOTOGRAPHY</Text>
        <View style={styles.brandRule} />

        <Text style={styles.auditTitle}>Audit Trail</Text>
        <Text style={styles.auditIntro}>
          This record is included to evidence the electronic signature on the
          attached contract, as contemplated by the U.S. ESIGN Act (15 U.S.C.
          § 7001 et seq.) and the Uniform Electronic Transactions Act.
        </Text>

        <AuditRow label="Signer Name" value={input.audit.signer_name} />
        <AuditRow label="Signer Email" value={input.audit.signer_email} />
        <AuditRow label="Signed At" value={new Date(input.audit.signed_at).toUTCString()} />
        <AuditRow label="Signer IP" value={input.audit.signer_ip} />
        <AuditRow label="Signer Device" value={input.audit.signer_user_agent} />

        <View style={styles.hmacRow}>
          <Text style={styles.hmacLabel}>Tamper-Evident Signature (HMAC-SHA-256)</Text>
          <Text style={styles.hmacValue}>{input.audit.hmac}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>Vero Photography — Audit Trail</Text>
          <Text
            style={styles.footerRight}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.auditRow}>
      <Text style={styles.auditKey}>{label}</Text>
      <Text style={styles.auditValue}>{value}</Text>
    </View>
  );
}

export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return renderToBuffer(<ContractDocument {...input} />);
}
