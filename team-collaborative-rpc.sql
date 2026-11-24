-- Aplicar em ambiente de teste antes da implantação; função anterior preservada.
BEGIN;
CREATE OR REPLACE FUNCTION public.vistoria_commit_collaborative_report(p_report_id text, p_actor_subject text, p_owner_subject text, p_expected_revision bigint, p_drive_file_id text, p_events jsonb DEFAULT '[]'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_revision bigint;v_name text;v_action text;
BEGIN
 IF p_report_id !~ '^[A-Za-z0-9_-]{1,100}$' OR p_drive_file_id IS NULL OR p_actor_subject IS NULL THEN RAISE EXCEPTION 'Identificador inválido'; END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>500 THEN RAISE EXCEPTION 'Eventos inválidos'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_events) AS e WHERE (e->>'action') NOT IN ('created','edited','completed','reopened','deleted','restored') OR (e->>'point_id') !~ '^[A-Za-z0-9:_-]{8,160}$') THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 SELECT technician_name INTO v_name FROM public.vistoria_members WHERE google_subject=p_actor_subject AND status='approved';
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta não aprovada'; END IF;
 IF p_expected_revision=0 AND p_actor_subject<>p_owner_subject THEN RAISE EXCEPTION 'Criação em nome de outra conta não autorizada'; END IF;
 IF p_expected_revision=0 THEN
 INSERT INTO public.vistoria_report_index(report_id,owner_subject,drive_file_id,revision,updated_at)
 VALUES(p_report_id,p_owner_subject,p_drive_file_id,1,now()) ON CONFLICT DO NOTHING RETURNING revision INTO v_revision;
 v_action='create';
 ELSE
 UPDATE public.vistoria_report_index SET drive_file_id=p_drive_file_id,revision=revision+1,updated_at=now()
 WHERE report_id=p_report_id AND owner_subject=p_owner_subject AND revision=p_expected_revision AND deleted_at IS NULL RETURNING revision INTO v_revision;
 v_action='update';
 END IF;
 IF v_revision IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.vistoria_audit(actor_subject,actor_name,report_id,action,revision,drive_file_id) VALUES(p_actor_subject,v_name,p_report_id,v_action,v_revision,p_drive_file_id);
 INSERT INTO public.vistoria_point_audit(report_id,point_id,action,actor_subject,actor_name,tag_snapshot,work_order_snapshot,previous_status,current_status,revision)
 SELECT p_report_id,e->>'point_id',e->>'action',p_actor_subject,v_name,left(e->>'tag',200),left(e->>'work_order',100),left(e->>'previous_status',80),left(e->>'current_status',80),v_revision
 FROM jsonb_array_elements(p_events) AS e;
 RETURN v_revision;
END $function$;
REVOKE ALL ON FUNCTION public.vistoria_commit_collaborative_report(text,text,text,bigint,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vistoria_commit_collaborative_report(text,text,text,bigint,text,jsonb) TO service_role;
COMMIT;
