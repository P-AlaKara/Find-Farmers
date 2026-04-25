CREATE POLICY "Admins can update buyers"
ON public.buyers
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete buyers"
ON public.buyers
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));