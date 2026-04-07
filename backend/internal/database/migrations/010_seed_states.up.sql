-- 28 Indian States
INSERT INTO states (name, code, type, is_union_territory) VALUES
('Andhra Pradesh', 'IN-AP', 'state', false),
('Arunachal Pradesh', 'IN-AR', 'state', false),
('Assam', 'IN-AS', 'state', false),
('Bihar', 'IN-BR', 'state', false),
('Chhattisgarh', 'IN-CT', 'state', false),
('Goa', 'IN-GA', 'state', false),
('Gujarat', 'IN-GJ', 'state', false),
('Haryana', 'IN-HR', 'state', false),
('Himachal Pradesh', 'IN-HP', 'state', false),
('Jharkhand', 'IN-JH', 'state', false),
('Karnataka', 'IN-KA', 'state', false),
('Kerala', 'IN-KL', 'state', false),
('Madhya Pradesh', 'IN-MP', 'state', false),
('Maharashtra', 'IN-MH', 'state', false),
('Manipur', 'IN-MN', 'state', false),
('Meghalaya', 'IN-ML', 'state', false),
('Mizoram', 'IN-MZ', 'state', false),
('Nagaland', 'IN-NL', 'state', false),
('Odisha', 'IN-OR', 'state', false),
('Punjab', 'IN-PB', 'state', false),
('Rajasthan', 'IN-RJ', 'state', false),
('Sikkim', 'IN-SK', 'state', false),
('Tamil Nadu', 'IN-TN', 'state', false),
('Telangana', 'IN-TG', 'state', false),
('Tripura', 'IN-TR', 'state', false),
('Uttar Pradesh', 'IN-UP', 'state', false),
('Uttarakhand', 'IN-UT', 'state', false),
('West Bengal', 'IN-WB', 'state', false)
ON CONFLICT (code) DO NOTHING;

-- 8 Union Territories
INSERT INTO states (name, code, type, is_union_territory) VALUES
('Andaman and Nicobar Islands', 'IN-AN', 'union_territory', true),
('Chandigarh', 'IN-CH', 'union_territory', true),
('Dadra and Nagar Haveli and Daman and Diu', 'IN-DH', 'union_territory', true),
('Delhi', 'IN-DL', 'union_territory', true),
('Jammu and Kashmir', 'IN-JK', 'union_territory', true),
('Ladakh', 'IN-LA', 'union_territory', true),
('Lakshadweep', 'IN-LD', 'union_territory', true),
('Puducherry', 'IN-PY', 'union_territory', true)
ON CONFLICT (code) DO NOTHING;
