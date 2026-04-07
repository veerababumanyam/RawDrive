CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    state_id INT REFERENCES states(id),
    owner_id UUID REFERENCES users(id),
    storage_bucket_id VARCHAR(255),
    gstin VARCHAR(15),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

INSERT INTO roles (name) VALUES ('Owner'), ('Admin'), ('Editor'), ('Viewer')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role_id INT NOT NULL REFERENCES roles(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
