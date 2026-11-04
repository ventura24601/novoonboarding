ALTER TABLE public.clients
 ADD COLUMN activation_status text,
 ADD COLUMN ic_id text,
 ADD COLUMN financial_id text,
 ADD COLUMN contract_id text,
 ADD COLUMN cep text,
 ADD COLUMN city text,
 ADD COLUMN state text,
 ADD COLUMN billing_system text,
 ADD COLUMN payment_method text,
 ADD COLUMN payment_value numeric,
 ADD COLUMN payment_modality text,
 ADD COLUMN payment_date date;