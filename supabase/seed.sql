-- Phase 3 seed — ~10 demo talacheros (real auth users) + services, coverage,
-- availability, and a handful of completed bookings with reviews. Mirrors the
-- Phase 1 mock data so the UI shows the same content, now DB-backed.
--
-- Runs on every `supabase db reset` against a fresh database. All demo accounts
-- use password `password123`. Emails are @demo.talachas.mx (clearly fake).
--
-- Implemented as a single DO block (not temp tables) because the seed runner
-- does not preserve session-scoped temp tables across statement batches.

do $$
declare
  t        record;
  r        record;
  uid      uuid;
  tp_id    uuid;
  tu_id    uuid;
  au_id    uuid;
  svc_id   uuid;
  rate     numeric;
  b_id     uuid;
  cdmx_id  uuid := (select id from public.cities where slug = 'cdmx');
begin
  -- -------------------------------------------------------------------------
  -- Talacheros. Inserting into auth.users fires handle_new_user(), which
  -- creates the public.users row and a talachero_profiles shell; we then fill
  -- the profile, services, and availability in the same iteration.
  -- -------------------------------------------------------------------------
  for t in
    select * from (values
      ('carlos.mendoza@demo.talachas.mx','Carlos Mendoza','roma-norte','handyman',280,4.9,142,187,8,true,
       'Especialista en mantenimiento y reparación del hogar con más de 8 años de experiencia. Trabajo rápido, limpio y con garantía. Traigo mis propias herramientas.',
       array['handyman','furniture_assembly','tv_mount']),
      ('ana.lopez@demo.talachas.mx','Ana López','condesa','cleaning',220,4.8,96,118,5,true,
       'Limpieza profunda, cocinas y baños. Uso productos amigables con mascotas y niños. Puntual y organizada.',
       array['cleaning','gardening']),
      ('jorge.hernandez@demo.talachas.mx','Jorge Hernández','del-valle','moving',320,4.7,74,89,6,false,
       'Mudanzas locales y entregas urgentes. Camioneta propia. Trabajo con un ayudante para cargas pesadas.',
       array['moving','delivery','handyman']),
      ('sofia.martinez@demo.talachas.mx','Sofía Martínez','coyoacan','painting',240,4.9,61,73,7,true,
       'Pintura interior y exterior con acabado profesional. Reparo grietas y humedades antes de pintar.',
       array['painting','handyman']),
      ('miguel.santos@demo.talachas.mx','Miguel Santos','polanco','tv_mount',260,4.6,88,104,4,true,
       'Instalación de TV en cualquier tipo de pared, oculto de cables y configuración inicial.',
       array['tv_mount','handyman','furniture_assembly']),
      ('elena.vargas@demo.talachas.mx','Elena Vargas','narvarte','gardening',200,4.8,42,51,6,false,
       'Jardinería residencial: poda, control de plagas, diseño de macetas y mantenimiento mensual.',
       array['gardening','cleaning']),
      ('raul.castillo@demo.talachas.mx','Raúl Castillo','alvaro-obregon','furniture_assembly',190,4.7,118,141,5,true,
       'Armado especializado de IKEA, Amazon, Costco. Nunca sobran piezas — lo prometo.',
       array['furniture_assembly','handyman']),
      ('veronica.flores@demo.talachas.mx','Verónica Flores','iztapalapa','cleaning',170,4.5,35,44,3,true,
       'Limpieza semanal y post-obra. Traigo mi propio equipo. Precios accesibles.',
       array['cleaning','delivery']),
      ('pablo.rios@demo.talachas.mx','Pablo Ríos','cuauhtemoc','delivery',150,4.6,58,72,2,true,
       'Entregas y mandados express en zona centro. Manejo motocicleta y auto pequeño.',
       array['delivery','moving']),
      ('gabriela.ochoa@demo.talachas.mx','Gabriela Ochoa','miguel-hidalgo','painting',230,4.8,67,82,6,false,
       'Pintura decorativa, texturas y acabados premium. Ofrezco muestrarios antes de empezar.',
       array['painting','cleaning','handyman'])
    ) as v(email, full_name, hood_slug, primary_svc, rate, rating, rcount, jobs, exp, avail_today, bio, services)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    )
    values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
      'authenticated', t.email,
      extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', 'talachero', 'full_name', t.full_name),
      now(), now(), '', '', '', ''
    )
    returning id into uid;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', t.email, 'email_verified', true),
      'email', now(), now(), now()
    );

    update public.talachero_profiles tp
    set
      bio                 = t.bio,
      hourly_rate         = t.rate,
      currency            = 'MXN',
      jobs_completed      = t.jobs,
      years_experience    = t.exp,
      verification_status = 'verified',
      city_id             = cdmx_id,
      neighborhood_id     = n.id,
      center_point        = n.center_point,
      radius_meters       = 6000
    from public.neighborhoods n
    where tp.user_id = uid and n.slug = t.hood_slug
    returning tp.id into tp_id;

    insert into public.talachero_services (talachero_id, service_category_id, is_primary)
    select tp_id, sc.id, (sc.slug = t.primary_svc)
    from public.service_categories sc
    where sc.slug = any (t.services);

    -- 3 one-hour slots/day for the next 14 days; "available today" talacheros
    -- start today, others tomorrow.
    insert into public.availability_slots (talachero_id, start_time, end_time, status)
    select
      tp_id,
      ((current_date + g.day_offset)::timestamp + hr) at time zone 'America/Mexico_City',
      ((current_date + g.day_offset)::timestamp + hr + interval '1 hour') at time zone 'America/Mexico_City',
      'open'
    from generate_series(case when t.avail_today then 0 else 1 end, 14) as g(day_offset)
    cross join unnest(array[interval '10 hours', interval '13 hours', interval '16 hours']) as hr;
  end loop;

  -- -------------------------------------------------------------------------
  -- Reviews. Each needs a completed booking between a client and the
  -- talachero; reviewer client accounts are created on first use.
  -- -------------------------------------------------------------------------
  for r in
    select * from (values
      ('carlos.mendoza@demo.talachas.mx','Mariana Ruiz','mariana.ruiz@demo.talachas.mx',5,3,'Carlos armó tres muebles de IKEA en una tarde. Puntual y muy profesional.'),
      ('carlos.mendoza@demo.talachas.mx','Andrés Pérez','andres.perez@demo.talachas.mx',5,12,'Reparó una fuga difícil de encontrar en el baño. Excelente comunicación.'),
      ('carlos.mendoza@demo.talachas.mx','Laura Fernández','laura.fernandez@demo.talachas.mx',4,21,'Buen trabajo montando la TV. Llegó un poco tarde pero avisó.'),
      ('ana.lopez@demo.talachas.mx','Sofía Jiménez','sofia.jimenez@demo.talachas.mx',5,2,'Dejó mi departamento como nuevo. Volveré a contratarla.'),
      ('ana.lopez@demo.talachas.mx','Diego Ramírez','diego.ramirez@demo.talachas.mx',5,9,'Súper detallista, incluso limpió lugares que no pedí.'),
      ('jorge.hernandez@demo.talachas.mx','Patricia Núñez','patricia.nunez@demo.talachas.mx',5,7,'Nos mudó en un solo viaje. Cuidó cada mueble con cinturones.'),
      ('jorge.hernandez@demo.talachas.mx','Roberto Alvarado','roberto.alvarado@demo.talachas.mx',4,14,'Buen servicio. La camioneta llegó 20 min tarde pero nada crítico.'),
      ('sofia.martinez@demo.talachas.mx','Emilia Torres','emilia.torres@demo.talachas.mx',5,5,'Pintó dos recámaras en un día. El acabado quedó impecable.'),
      ('miguel.santos@demo.talachas.mx','Ricardo Vidal','ricardo.vidal@demo.talachas.mx',5,4,'Instaló mi TV de 65 pulgadas y escondió los cables. Perfecto.'),
      ('miguel.santos@demo.talachas.mx','Carla Ávila','carla.avila@demo.talachas.mx',4,16,'Buen trabajo. Cobró un poco extra por el soporte pero fue justo.'),
      ('elena.vargas@demo.talachas.mx','Fernanda Solís','fernanda.solis@demo.talachas.mx',5,6,'Rescató mis plantas de una plaga. Muy paciente explicando cuidados.'),
      ('raul.castillo@demo.talachas.mx','Alejandra Ponce','alejandra.ponce@demo.talachas.mx',5,1,'Armó un ropero enorme en 2 horas. Rapidísimo.'),
      ('raul.castillo@demo.talachas.mx','Tomás Ibáñez','tomas.ibanez@demo.talachas.mx',5,11,'Muy cuidadoso con los tornillos y las instrucciones.'),
      ('veronica.flores@demo.talachas.mx','Julieta Barrera','julieta.barrera@demo.talachas.mx',4,8,'Cumplió lo prometido y muy amable.'),
      ('pablo.rios@demo.talachas.mx','Iván Marín','ivan.marin@demo.talachas.mx',5,2,'Recogió medicinas en menos de una hora. Excelente.'),
      ('gabriela.ochoa@demo.talachas.mx','Natalia Cerón','natalia.ceron@demo.talachas.mx',5,13,'Ayudó a elegir los tonos y quedó espectacular.')
    ) as v(tal_email, author_name, author_email, rating, days_ago, body)
  loop
    select id into au_id from public.users where email = r.author_email;
    if au_id is null then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      )
      values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
        'authenticated', r.author_email,
        extensions.crypt('password123', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('role', 'client', 'full_name', r.author_name),
        now(), now(), '', '', '', ''
      )
      returning id into au_id;

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      )
      values (
        gen_random_uuid(), au_id, au_id::text,
        jsonb_build_object('sub', au_id::text, 'email', r.author_email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    select tp.id, tp.user_id, tp.hourly_rate
      into tp_id, tu_id, rate
      from public.talachero_profiles tp
      join public.users us on us.id = tp.user_id
      where us.email = r.tal_email;

    select service_category_id into svc_id
      from public.talachero_services
      where talachero_id = tp_id and is_primary
      limit 1;

    insert into public.bookings (
      client_id, talachero_id, service_category_id, status, price, currency,
      created_at, updated_at
    )
    values (
      au_id, tp_id, svc_id, 'completed', rate, 'MXN',
      now() - make_interval(days => r.days_ago),
      now() - make_interval(days => r.days_ago)
    )
    returning id into b_id;

    insert into public.reviews (booking_id, author_id, target_id, rating, comment, created_at)
    values (b_id, au_id, tu_id, r.rating, r.body, now() - make_interval(days => r.days_ago));
  end loop;

  -- -------------------------------------------------------------------------
  -- One open dispute so the admin queue renders without Stripe. Direct insert
  -- (seed runs as superuser, not through raise_dispute); mark the booking
  -- captured so it reads as refundable context in the queue.
  -- -------------------------------------------------------------------------
  select b.id into b_id
    from public.bookings b
    join public.users cu on cu.id = b.client_id
    where cu.email = 'mariana.ruiz@demo.talachas.mx' and b.status = 'completed'
    order by b.created_at desc
    limit 1;
  if b_id is not null then
    update public.bookings set payment_status = 'captured' where id = b_id;
    insert into public.disputes (booking_id, raised_by, reason)
    select b_id, b.client_id, 'El trabajo quedó incompleto y no respondió mis mensajes.'
      from public.bookings b where b.id = b_id;
  end if;

  -- -------------------------------------------------------------------------
  -- Platform admin. Inserting fires handle_new_user() (which forces role to
  -- 'client' — admin is never self-assignable), so promote to admin after.
  -- -------------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
    'authenticated', 'admin@talachas.mx',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', 'admin', 'full_name', 'Plataforma Admin'),
    now(), now(), '', '', '', ''
  )
  returning id into uid;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', 'admin@talachas.mx', 'email_verified', true),
    'email', now(), now(), now()
  );

  update public.users set role = 'admin' where id = uid;
end $$;
