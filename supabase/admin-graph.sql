-- =============================================
-- Graph Data Function for Visual Graph Engine
-- Returns nodes and edges for relationship visualization
-- =============================================

CREATE OR REPLACE FUNCTION admin_get_graph_data(p_entity_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_nodes JSONB := '[]'::jsonb;
    v_edges JSONB := '[]'::jsonb;
    v_entity_type TEXT;
    v_guest RECORD;
    v_user RECORD;
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Determine entity type
    IF EXISTS (SELECT 1 FROM guests WHERE id = p_entity_id) THEN
        v_entity_type := 'guest';
        SELECT * INTO v_guest FROM guests WHERE id = p_entity_id;
        
        -- Add main guest node
        v_nodes := v_nodes || jsonb_build_object(
            'id', p_entity_id,
            'label', 'Guest ' || LEFT(p_entity_id::text, 8),
            'type', 'guest',
            'data', jsonb_build_object(
                'status', v_guest.status,
                'post_count', v_guest.post_count,
                'email', v_guest.email
            )
        );
        
        -- Add IP nodes from security logs
        FOR v_user IN 
            SELECT DISTINCT real_ip, country, city, isp
            FROM ip_security_logs 
            WHERE guest_id = p_entity_id
        LOOP
            v_nodes := v_nodes || jsonb_build_object(
                'id', 'ip_' || v_user.real_ip,
                'label', v_user.real_ip,
                'type', 'ip',
                'data', jsonb_build_object(
                    'country', v_user.country,
                    'city', v_user.city,
                    'isp', v_user.isp
                )
            );
            
            v_edges := v_edges || jsonb_build_object(
                'source', p_entity_id,
                'target', 'ip_' || v_user.real_ip,
                'type', 'used_ip'
            );
        END LOOP;
        
        -- Add post nodes
        FOR v_user IN 
            SELECT id, title, created_at, hidden
            FROM posts 
            WHERE guest_id = p_entity_id
            LIMIT 20
        LOOP
            v_nodes := v_nodes || jsonb_build_object(
                'id', v_user.id,
                'label', COALESCE(LEFT(v_user.title, 20), 'Untitled'),
                'type', 'post',
                'data', jsonb_build_object(
                    'created_at', v_user.created_at,
                    'hidden', v_user.hidden
                )
            );
            
            v_edges := v_edges || jsonb_build_object(
                'source', p_entity_id,
                'target', v_user.id,
                'type', 'posted'
            );
        END LOOP;
        
        -- Add comment nodes
        FOR v_user IN 
            SELECT id, post_id, LEFT(content, 30) as content_preview
            FROM comments 
            WHERE guest_id = p_entity_id
            LIMIT 20
        LOOP
            v_nodes := v_nodes || jsonb_build_object(
                'id', v_user.id,
                'label', v_user.content_preview || '...',
                'type', 'comment',
                'data', jsonb_build_object('post_id', v_user.post_id)
            );
            
            v_edges := v_edges || jsonb_build_object(
                'source', p_entity_id,
                'target', v_user.id,
                'type', 'commented'
            );
        END LOOP;
        
        -- Find related guests (same IP)
        FOR v_user IN 
            SELECT DISTINCT g.id, g.fingerprint, g.post_count
            FROM ip_security_logs isl1
            JOIN ip_security_logs isl2 ON isl1.real_ip = isl2.real_ip
            JOIN guests g ON g.id = isl2.guest_id
            WHERE isl1.guest_id = p_entity_id
            AND isl2.guest_id != p_entity_id
            LIMIT 10
        LOOP
            v_nodes := v_nodes || jsonb_build_object(
                'id', v_user.id,
                'label', 'Guest ' || LEFT(v_user.id::text, 8),
                'type', 'related_guest',
                'data', jsonb_build_object('post_count', v_user.post_count)
            );
            
            v_edges := v_edges || jsonb_build_object(
                'source', p_entity_id,
                'target', v_user.id,
                'type', 'shared_ip'
            );
        END LOOP;
        
    ELSIF EXISTS (SELECT 1 FROM profiles WHERE id = p_entity_id) THEN
        v_entity_type := 'user';
        SELECT * INTO v_user FROM profiles WHERE id = p_entity_id;
        
        -- Add main user node
        v_nodes := v_nodes || jsonb_build_object(
            'id', p_entity_id,
            'label', '@' || v_user.username,
            'type', 'user',
            'data', jsonb_build_object(
                'role', v_user.role,
                'display_name', v_user.display_name
            )
        );
        
        -- Add post nodes
        FOR v_guest IN 
            SELECT id, title, created_at
            FROM posts 
            WHERE user_id = p_entity_id
            LIMIT 20
        LOOP
            v_nodes := v_nodes || jsonb_build_object(
                'id', v_guest.id,
                'label', COALESCE(LEFT(v_guest.title, 20), 'Untitled'),
                'type', 'post',
                'data', jsonb_build_object('created_at', v_guest.created_at)
            );
            
            v_edges := v_edges || jsonb_build_object(
                'source', p_entity_id,
                'target', v_guest.id,
                'type', 'posted'
            );
        END LOOP;
        
        -- Add followers
        FOR v_guest IN 
            SELECT p.id, p.username
            FROM follows f
            JOIN profiles p ON p.id = f.follower_id
            WHERE f.following_id = p_entity_id
            LIMIT 10
        LOOP
            v_nodes := v_nodes || jsonb_build_object(
                'id', v_guest.id,
                'label', '@' || v_guest.username,
                'type', 'follower',
                'data', '{}'::jsonb
            );
            
            v_edges := v_edges || jsonb_build_object(
                'source', v_guest.id,
                'target', p_entity_id,
                'type', 'follows'
            );
        END LOOP;
        
        -- Add following
        FOR v_guest IN 
            SELECT p.id, p.username
            FROM follows f
            JOIN profiles p ON p.id = f.following_id
            WHERE f.follower_id = p_entity_id
            LIMIT 10
        LOOP
            v_nodes := v_nodes || jsonb_build_object(
                'id', v_guest.id,
                'label', '@' || v_guest.username,
                'type', 'following',
                'data', '{}'::jsonb
            );
            
            v_edges := v_edges || jsonb_build_object(
                'source', p_entity_id,
                'target', v_guest.id,
                'type', 'follows'
            );
        END LOOP;
    ELSE
        RETURN jsonb_build_object('error', 'Entity not found');
    END IF;

    RETURN jsonb_build_object(
        'entity_id', p_entity_id,
        'entity_type', v_entity_type,
        'nodes', v_nodes,
        'edges', v_edges,
        'node_count', jsonb_array_length(v_nodes),
        'edge_count', jsonb_array_length(v_edges)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_graph_data TO authenticated;
