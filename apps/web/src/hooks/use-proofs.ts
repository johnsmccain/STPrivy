'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ZKProof, ProofVerification, CircuitId } from '@/types';

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api.get<T>(path);
  } catch {
    return fallback;
  }
}

export function useProofs() {
  return useQuery<ZKProof[]>({
    queryKey: ['proofs'],
    queryFn: () => safeGet('/proofs', []),
    refetchInterval: (query) => {
      // Auto-refresh if there are pending/generating proofs
      const hasPending = query.state.data?.some((p) => ['PENDING', 'GENERATING'].includes(p.status));
      return hasPending ? 2000 : false; // Poll every 2s if pending, otherwise stop
    },
  });
}

export function useGenerateProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { credentialId: string; circuitId: CircuitId }) =>
      api.post<ZKProof>('/proofs/generate', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proofs'] }),
  });
}

export function useProof(proofId: string | null) {
  return useQuery<ZKProof>({
    queryKey: ['proof', proofId],
    queryFn: () => api.get<ZKProof>(`/proofs/${proofId}`),
    enabled: !!proofId,
    refetchInterval: (query) => {
      // Poll every 2s while proof is pending or generating
      const data = query.state.data;
      if (data && ['PENDING', 'GENERATING'].includes(data.status)) {
        return 2000;
      }
      return false;
    },
  });
}

export function useVerifyProof() {
  return useMutation({
    mutationFn: (proofId: string) =>
      api.post<ProofVerification>('/proofs/verify', { proofId }),
  });
}

export function useProofVerifications() {
  return useQuery<ProofVerification[]>({
    queryKey: ['proof-verifications'],
    queryFn: () => safeGet('/proofs/verifications', []),
  });
}
