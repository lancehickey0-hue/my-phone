/**
 * Subscription Screen — Billing, plan management, payment method
 *
 * Shows:
 *   - Current plan status (trial/active/expired)
 *   - Trial countdown
 *   - Pricing tiers
 *   - Subscribe via Stripe or PayPal
 *   - Cancel/reactivate subscription
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { colors, fontSize, spacing, borderRadius } from '../src/lib/theme';

export default function SubscriptionScreen() {
  const router = useRouter();
  const subscription = useQuery(api.billing.getSubscription);
  const isOwner = useQuery(api.billing.checkOwnerAccess);
  const cancelSub = useMutation(api.billing.cancelSubscription);

  const [loading, setLoading] = useState<'stripe' | 'paypal' | 'cancel' | null>(null);

  if (!subscription) {
    return (
      <View style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading subscription...</Text>
        </View>
      </View>
    );
  }

  const isTrial = subscription.status === 'trial';
  const isActive = subscription.status === 'active';
  const isExpired = subscription.status === 'expired';
  const isCancelled = subscription.status === 'cancelled';

  const handleStripeCheckout = async () => {
    setLoading('stripe');
    // In production: call a Convex action that creates a Stripe Checkout Session
    // and returns the URL, then open it in the browser
    //
    // const { url } = await createCheckoutSession({ paymentMethod: 'stripe' });
    // await Linking.openURL(url);
    //
    // After payment, Stripe webhook calls activateSubscription mutation

    // Simulated
    setTimeout(() => {
      Alert.alert(
        'Stripe Checkout',
        'In production, this opens the Stripe payment page. After payment, your subscription activates automatically.',
      );
      setLoading(null);
    }, 1000);
  };

  const handlePayPalCheckout = async () => {
    setLoading('paypal');
    // In production: create PayPal subscription and redirect
    setTimeout(() => {
      Alert.alert(
        'PayPal Checkout',
        'In production, this opens PayPal to set up recurring payments.',
      );
      setLoading(null);
    }, 1000);
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Subscription?',
      'You\'ll keep access until the end of your current billing period. You can resubscribe anytime.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            setLoading('cancel');
            try {
              await cancelSub();
              Alert.alert('Cancelled', 'Your subscription has been cancelled.');
            } catch (err) {
              Alert.alert('Error', 'Failed to cancel subscription.');
            }
            setLoading(null);
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>
          {isTrial ? '⏳' : isActive ? '✅' : isExpired ? '⚠️' : '⏸️'}
        </Text>
        <Text style={styles.headerTitle}>
          {isTrial ? 'Free Trial' : isActive ? 'Active Plan' : isExpired ? 'Plan Expired' : 'Cancelled'}
        </Text>
      </View>

      {/* Owner badge */}
      {isOwner && (
        <View style={styles.ownerBadge}>
          <Text style={styles.ownerText}>👑 Owner Account — Full access always enabled</Text>
        </View>
      )}

      {/* Trial countdown */}
      {isTrial && (
        <View style={styles.trialCard}>
          <Text style={styles.trialDays}>{subscription.trialDaysRemaining}</Text>
          <Text style={styles.trialLabel}>days remaining</Text>
          <View style={styles.trialBar}>
            <View
              style={[
                styles.trialBarFill,
                { width: `${Math.max(5, (subscription.trialDaysRemaining / 15) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.trialSubtext}>
            Your 15-day free trial includes all features.{'\n'}
            Subscribe before it ends to keep your devices protected.
          </Text>
        </View>
      )}

      {/* Current plan info (active/cancelled) */}
      {(isActive || isCancelled) && (
        <View style={styles.planCard}>
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Status</Text>
            <Text style={[styles.planValue, isCancelled && { color: colors.warning }]}>
              {isActive ? '✅ Active' : '⏸️ Cancels at period end'}
            </Text>
          </View>
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Current Price</Text>
            <Text style={styles.planValue}>
              ${(subscription.currentPrice / 100).toFixed(2)}/mo
              {subscription.isInIntro && ' (intro)'}
            </Text>
          </View>
          {subscription.isInIntro && (
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>After Intro</Text>
              <Text style={styles.planValue}>${(subscription.nextPrice / 100).toFixed(2)}/mo</Text>
            </View>
          )}
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Payment</Text>
            <Text style={styles.planValue}>
              {subscription.paymentMethod === 'stripe' ? '💳 Stripe' : '🅿️ PayPal'}
            </Text>
          </View>
          {subscription.currentPeriodEnd && (
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>Next Billing</Text>
              <Text style={styles.planValue}>
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Pricing tiers */}
      {(isTrial || isExpired) && (
        <>
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>

          {/* Intro tier */}
          <View style={[styles.tierCard, styles.tierCardHighlighted]}>
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>BEST VALUE</Text>
            </View>
            <Text style={styles.tierPrice}>$2.99</Text>
            <Text style={styles.tierPeriod}>per month for 3 months</Text>
            <View style={styles.tierDivider} />
            <TierFeature text="All device types (phone, tablet, laptop, earbuds, watch)" />
            <TierFeature text="Voice wake word detection (always on)" />
            <TierFeature text="Biometric security (Face ID / fingerprint)" />
            <TierFeature text="Real-time GPS tracking + map" />
            <TierFeature text="Remote alarm, lock & unlock" />
            <TierFeature text="Up to 10 devices" />
          </View>

          {/* Regular tier */}
          <View style={styles.tierCard}>
            <Text style={styles.tierPrice}>$5.99</Text>
            <Text style={styles.tierPeriod}>per month after intro period</Text>
            <View style={styles.tierDivider} />
            <TierFeature text="Everything in intro +" />
            <TierFeature text="Priority support" />
            <TierFeature text="Early access to AI companion features" />
          </View>
        </>
      )}

      {/* Action buttons */}
      {(isTrial || isExpired) && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={styles.stripeButton}
            onPress={handleStripeCheckout}
            disabled={loading !== null}
            activeOpacity={0.8}
          >
            <Text style={styles.stripeButtonText}>
              {loading === 'stripe' ? '⏳ Opening Checkout...' : '💳  Subscribe with Stripe'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.paypalButton}
            onPress={handlePayPalCheckout}
            disabled={loading !== null}
            activeOpacity={0.8}
          >
            <Text style={styles.paypalButtonText}>
              {loading === 'paypal' ? '⏳ Opening PayPal...' : '🅿️  Subscribe with PayPal'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cancel button */}
      {isActive && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={loading !== null}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelButtonText}>
            {loading === 'cancel' ? 'Cancelling...' : 'Cancel Subscription'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Resubscribe for cancelled */}
      {isCancelled && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={styles.stripeButton}
            onPress={handleStripeCheckout}
            disabled={loading !== null}
          >
            <Text style={styles.stripeButtonText}>Resubscribe</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* AI teaser */}
      <View style={styles.aiTeaser}>
        <Text style={styles.aiTeaserEmoji}>🤖</Text>
        <Text style={styles.aiTeaserTitle}>AI Companion — Coming Soon</Text>
        <Text style={styles.aiTeaserText}>
          A built-in, fully integrated AI companion is on the way.
          Subscribers get early access.
        </Text>
      </View>

      {/* Back */}
      <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
        <Text style={styles.backLinkText}>← Back</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function TierFeature({ text }: { text: string }) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureCheck}>✓</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const gold = '#D4A843';
const bgDark = '#06060A';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: bgDark },
  content: { padding: 24, paddingTop: 56 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textMuted, fontSize: 16 },

  // Header
  header: { alignItems: 'center', marginBottom: 20 },
  headerEmoji: { fontSize: 48, marginBottom: 8 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: gold },

  // Owner
  ownerBadge: {
    backgroundColor: 'rgba(212,168,67,0.1)',
    borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(212,168,67,0.2)',
  },
  ownerText: { fontSize: 14, color: gold, textAlign: 'center', fontWeight: '600' },

  // Trial countdown
  trialCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16, padding: 24, alignItems: 'center',
    marginBottom: 24, borderWidth: 1, borderColor: colors.border,
  },
  trialDays: { fontSize: 56, fontWeight: '900', color: gold },
  trialLabel: { fontSize: 16, color: colors.textSecondary, marginBottom: 16 },
  trialBar: {
    width: '100%', height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 16, overflow: 'hidden',
  },
  trialBarFill: { height: '100%', borderRadius: 3, backgroundColor: gold },
  trialSubtext: {
    fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19,
  },

  // Plan card
  planCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: colors.border,
  },
  planRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  planLabel: { fontSize: 14, color: colors.textMuted },
  planValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },

  // Tiers
  sectionTitle: {
    fontSize: 18, fontWeight: '800', color: gold,
    marginBottom: 14, textAlign: 'center',
  },
  tierCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16, padding: 22, marginBottom: 14,
    borderWidth: 1, borderColor: colors.border, position: 'relative',
  },
  tierCardHighlighted: {
    borderColor: 'rgba(212,168,67,0.35)',
    backgroundColor: 'rgba(212,168,67,0.04)',
  },
  tierBadge: {
    position: 'absolute', top: -10, right: 16,
    backgroundColor: gold, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
  },
  tierBadgeText: { fontSize: 11, fontWeight: '800', color: bgDark },
  tierPrice: { fontSize: 34, fontWeight: '900', color: colors.textPrimary },
  tierPeriod: { fontSize: 14, color: colors.textMuted, marginBottom: 4 },
  tierDivider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 14,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  featureCheck: { fontSize: 14, color: gold, fontWeight: '700', marginTop: 1 },
  featureText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },

  // Actions
  actionSection: { marginTop: 8, marginBottom: 16 },
  stripeButton: {
    backgroundColor: gold,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    marginBottom: 10,
  },
  stripeButtonText: { fontSize: 17, fontWeight: '700', color: bgDark },
  paypalButton: {
    backgroundColor: '#0070BA',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  paypalButtonText: { fontSize: 17, fontWeight: '700', color: '#FFF' },

  cancelButton: {
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    marginTop: 8, marginBottom: 16,
  },
  cancelButtonText: { fontSize: 14, fontWeight: '600', color: colors.danger },

  // AI teaser
  aiTeaser: {
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderRadius: 16, padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.12)',
    marginTop: 8,
  },
  aiTeaserEmoji: { fontSize: 36, marginBottom: 8 },
  aiTeaserTitle: { fontSize: 16, fontWeight: '700', color: colors.info, marginBottom: 6 },
  aiTeaserText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // Back
  backLink: { alignItems: 'center', marginTop: 16 },
  backLinkText: { fontSize: 14, color: 'rgba(255,255,255,0.35)' },
});
