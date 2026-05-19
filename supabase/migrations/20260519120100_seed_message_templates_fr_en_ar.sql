-- ============================================================================
-- 20260519120100_seed_message_templates_fr_en_ar
--
-- Backfills the FR/EN/AR copy that the Pilot Patrick spec asserts on. The
-- WhatsAppReminders component looks up templates by `key`:
--
--   pre_arrival   — message sent J-1
--   welcome       — message sent on arrival day (includes guest portal link)
--   post_checkout — message sent the day after departure (review request)
--   photo.reminder.checkout_eve — eve-of-checkout host nudge (used by the
--                                 dispatch_checkout_eve_reminders cron job)
--
-- The variable `{{portal_link}}` is rendered by the client to
-- https://escapar.net/g/<slug> using the guest_books row for that property.
--
-- Idempotent: INSERT ... ON CONFLICT (organization_id, key) DO NOTHING.
-- Backfills every existing organization at once via INSERT ... SELECT.
-- ============================================================================

INSERT INTO public.message_templates
  (organization_id, key, label, icon, body_fr, body_en, body_ar, sort_order, is_default)
SELECT o.id, t.key, t.label, t.icon, t.body_fr, t.body_en, t.body_ar, t.sort_order, true
  FROM public.organizations o
  CROSS JOIN (VALUES
    (
      'pre_arrival',
      'Pré-arrivée (J-1)',
      '📅',
      E'Bonjour {{guest_name}},\nNous vous attendons demain {{check_in}} à {{property}}. '
        || E'Code d’accès et infos pratiques dans votre livret : {{portal_link}}.\n'
        || E'Bon voyage !',
      E'Hi {{guest_name}},\nWe look forward to welcoming you tomorrow {{check_in}} '
        || E'at {{property}}. Access code & house info: {{portal_link}}.\nSafe travels!',
      E'مرحبًا {{guest_name}}،\nنرحب بكم غدًا {{check_in}} في {{property}}. '
        || E'كود الدخول والتعليمات: {{portal_link}}.\nرحلة موفقة!',
      10
    ),
    (
      'welcome',
      'Bienvenue (jour d’arrivée)',
      '🎉',
      E'Bienvenue {{guest_name}} !\nVotre livret digital est ici : {{portal_link}}.\n'
        || E'Wi-Fi, services et conciergerie sont à portée de clic. Bon séjour à {{property}} !',
      E'Welcome {{guest_name}}!\nYour digital welcome book: {{portal_link}}.\n'
        || E'Wi-Fi, services and concierge are one tap away. Enjoy your stay at {{property}}!',
      E'مرحبًا {{guest_name}}!\nدليلك الرقمي هنا: {{portal_link}}.\n'
        || E'الواي فاي، الخدمات والكونسيرج بنقرة واحدة. إقامة سعيدة في {{property}}!',
      20
    ),
    (
      'post_checkout',
      'Post-départ (J+1)',
      '⭐',
      E'Bonjour {{guest_name}},\nMerci pour votre séjour à {{property}}. '
        || E'Un retour 5★ sur Airbnb nous aiderait beaucoup. À très bientôt !',
      E'Hi {{guest_name}},\nThanks for staying at {{property}}. A 5★ review on Airbnb '
        || E'would help us a lot. See you soon!',
      E'مرحبًا {{guest_name}}،\nشكرًا على إقامتك في {{property}}. تقييم 5★ على Airbnb '
        || E'سيدعمنا كثيرًا. إلى اللقاء قريبًا!',
      30
    ),
    (
      'photo.reminder.checkout_eve',
      'Rappel photos départ (veille)',
      '📸',
      E'Bonjour {{guest_name}}, vous partez demain de {{property}}. '
        || E'Avez-vous partagé vos photos du séjour ? Vous pouvez les ajouter '
        || E'depuis votre livret : {{portal_link}} 📸',
      E'Hi {{guest_name}}, you’re checking out of {{property}} tomorrow. '
        || E'Have you shared your stay photos? You can upload them from '
        || E'your welcome book: {{portal_link}} 📸',
      E'مرحبًا {{guest_name}}، ستغادر غدًا من {{property}}. '
        || E'هل شاركت صورك من الإقامة؟ يمكنك رفعها من دليلك: {{portal_link}} 📸',
      40
    )
  ) AS t(key, label, icon, body_fr, body_en, body_ar, sort_order)
ON CONFLICT (organization_id, key) DO NOTHING;
