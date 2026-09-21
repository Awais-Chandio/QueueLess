import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ClipboardList, Pill } from 'lucide-react-native';
import Card from '../../../components/ui/Card';
import { useTheme } from '../../../hooks/useTheme';
import { scaleFont } from '../../../utils/responsive';
import { formatDateKey } from '../../doctor/utils/doctorFormat';
import type { VisitSummary } from '../../../types/visitSummary';

type Props = {
  summary: VisitSummary;
};

/**
 * Read-only summary of a completed visit, styled like the ReceiptScreen ticket:
 * an elevated card with small muted labels above bold values.
 */
export const VisitSummaryCard = ({ summary }: Props) => {
  const { colors, spacing, typography, radius } = useTheme();
  const { diagnosis, notes, follow_up_date: followUp, prescription_items: items } = summary;

  const label = (text: string) => (
    <Text style={[styles.label, { color: colors.textSecondary }]}>{text}</Text>
  );
  const divider = <View style={[styles.divider, { borderBottomColor: colors.border + '50' }]} />;

  return (
    <Card
      variant="elevated"
      style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md }}
    >
      <View style={styles.titleRow}>
        <View style={[styles.iconPill, { backgroundColor: `${colors.primary}12` }]}>
          <ClipboardList color={colors.primary} size={scaleFont(16)} />
        </View>
        <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }}>
          Visit summary
        </Text>
      </View>

      {!!diagnosis && (
        <View style={{ marginTop: spacing.md }}>
          {label('Diagnosis')}
          <Text style={[styles.value, { color: colors.text }]}>{diagnosis}</Text>
        </View>
      )}

      {items.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          {divider}
          <View style={styles.titleRow}>
            <Pill color={colors.info} size={scaleFont(16)} />
            <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: '800' }}>
              Prescription
            </Text>
          </View>
          {items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.medicine,
                {
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  marginTop: spacing.sm,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontSize: typography.sizes.md, fontWeight: '800' }}>
                {`${index + 1}. ${item.medicine_name}`}
              </Text>
              <View style={[styles.detailRow, { marginTop: spacing.xs }]}>
                {label('Dosage')}
                <Text style={[styles.detailValue, { color: colors.text }]}>{item.dosage}</Text>
              </View>
              <View style={[styles.detailRow, { marginTop: spacing.xs }]}>
                {label('Frequency')}
                <Text style={[styles.detailValue, { color: colors.text }]}>{item.frequency}</Text>
              </View>
              <View style={[styles.detailRow, { marginTop: spacing.xs }]}>
                {label('Duration')}
                <Text style={[styles.detailValue, { color: colors.text }]}>{item.duration}</Text>
              </View>
              {!!item.instructions && (
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                    lineHeight: 18,
                    marginTop: spacing.sm,
                  }}
                >
                  {item.instructions}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {!!notes && (
        <View style={{ marginTop: spacing.md }}>
          {divider}
          {label('Notes')}
          <Text style={[styles.value, { color: colors.text }]}>{notes}</Text>
        </View>
      )}

      {!!followUp && (
        <View style={{ marginTop: spacing.md }}>
          {divider}
          <View style={styles.detailRow}>
            {label('Follow-up')}
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {formatDateKey(followUp, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
};

export default VisitSummaryCard;

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleFont(10),
  },
  iconPill: {
    width: scaleFont(34),
    height: scaleFont(34),
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  medicine: {},
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: '65%',
  },
});
