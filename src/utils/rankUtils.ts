export const POSTOS_GRADUACOES_EXTENSO = [
  'Soldado',
  'Cabo',
  'Sargento',
  'Subtenente',
  'Tenente',
  'Capitão',
  'Major',
  'Tenente-Coronel',
  'Coronel',
  'Civil'
] as const;

export const POSTOS_GRADUACOES_SIGLAS = [
  'SD',
  'CB',
  'SGT',
  'ST',
  'TEN',
  'CAP',
  'MAJ',
  'TC',
  'CEL',
  'CIVIL'
] as const;

/**
 * Converte qualquer string de Posto/Graduação para a sigla oficial em maiúsculas.
 * Exemplo: "Soldado" -> "SD", "2º Sargento" -> "SGT", "Cabo" -> "CB", "Civil" -> "CIVIL"
 */
export function formatPostoGraduacaoSigla(posto?: string | null): string {
  if (!posto) return '';
  const clean = posto.trim();
  if (!clean) return '';

  const upper = clean.toUpperCase();

  // Se já for uma sigla exata
  if (POSTOS_GRADUACOES_SIGLAS.includes(upper as any)) {
    return upper;
  }

  // Verificação por padrões/termos
  if (upper.includes('CIVIL')) return 'CIVIL';
  if (upper.includes('SOLDADO') || upper === 'SD') return 'SD';
  if (upper.includes('CABO') || upper === 'CB') return 'CB';
  if (upper.includes('SARGENTO') || upper.includes('SGT')) return 'SGT';
  if (upper.includes('SUBTENENTE') || upper === 'ST') return 'ST';
  if (upper.includes('TENENTE-CORONEL') || upper === 'TC') return 'TC';
  if (upper.includes('CORONEL') || upper === 'CEL') return 'CEL';
  if (upper.includes('TENENTE') || upper.includes('TEN')) return 'TEN';
  if (upper.includes('CAPITÃO') || upper.includes('CAPITAO') || upper === 'CAP') return 'CAP';
  if (upper.includes('MAJOR') || upper === 'MAJ') return 'MAJ';

  return upper;
}

/**
 * Normaliza qualquer sigla ou string de posto para o nome padrão por extenso.
 * Exemplo: "SD" -> "Soldado", "SGT" -> "Sargento", "CB" -> "Cabo"
 */
export function normalizarPostoExtenso(posto?: string | null): string {
  if (!posto) return 'Soldado';
  const sigla = formatPostoGraduacaoSigla(posto);
  switch (sigla) {
    case 'SD': return 'Soldado';
    case 'CB': return 'Cabo';
    case 'SGT': return 'Sargento';
    case 'ST': return 'Subtenente';
    case 'TEN': return 'Tenente';
    case 'CAP': return 'Capitão';
    case 'MAJ': return 'Major';
    case 'TC': return 'Tenente-Coronel';
    case 'CEL': return 'Coronel';
    case 'CIVIL': return 'Civil';
    default:
      // Se já estiver por extenso na lista, mantém
      const found = POSTOS_GRADUACOES_EXTENSO.find(p => p.toLowerCase() === posto.trim().toLowerCase());
      return found || posto;
  }
}

/**
 * Remove o prefixo interno de armeiro ('ARM-', 'A-', 'A') para exibição visual limpa ao usuário.
 * Exemplo: "ARM-7317573" -> "7317573", "A-128.450-2" -> "128.450-2", "7317573" -> "7317573"
 */
export function formatMatriculaExibicao(matricula?: string | null): string {
  if (!matricula) return '';
  const mat = matricula.trim();
  if (!mat) return '';
  const upper = mat.toUpperCase();
  if (upper.startsWith('ARM-')) {
    return mat.substring(4);
  }
  if (upper.startsWith('A-')) {
    return mat.substring(2);
  }
  if (upper.length > 1 && upper.startsWith('A') && (/[0-9]/.test(upper[1]) || upper[1] === '.' || upper[1] === '-')) {
    return mat.substring(1);
  }
  return mat;
}

/**
 * Garante o prefixo interno 'ARM-' para armazenar a matrícula do armeiro no banco de dados sem conflitar com a matrícula de policial/cautela.
 * Exemplo: "7317573" -> "ARM-7317573", "ARM-7317573" -> "ARM-7317573"
 */
export function formatMatriculaArmeiroInterna(matricula: string): string {
  const clean = formatMatriculaExibicao(matricula).toUpperCase();
  if (!clean) return '';
  return `ARM-${clean}`;
}

/**
 * Remove qualquer bloco redundante de conferência de estoque que tenha sido acidentalmente
 * gravado dentro da seção de alterações de uma ata de passagem de serviço (troca_turno).
 */
export function sanitizeHandoverDescriptionText(desc: string): string {
  if (!desc || typeof desc !== 'string') return '';
  if (!desc.includes('ATA DE PASSAGEM DE SERVIÇO') && !desc.includes('SITUAÇÃO DAS ALTERAÇÕES')) {
    return desc;
  }

  const lines = desc.split('\n');
  let currentSection = '';
  let skippingStockConference = false;
  const topLines: string[] = [];
  const pendenciasLines: string[] = [];
  const passagemLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      trimmed === 'SITUAÇÃO DAS ALTERAÇÕES E PENDÊNCIAS DO SERVIÇO' ||
      trimmed === 'SITUACAO DAS ALTERACOES E PENDENCIAS DO SERVICO'
    ) {
      currentSection = 'PENDENCIAS';
      continue;
    }

    if (trimmed === 'PASSAGEM DE SERVIÇO' || trimmed === 'PASSAGEM DE SERVICO') {
      currentSection = 'PASSAGEM';
      continue;
    }

    if (currentSection === 'PENDENCIAS') {
      const isStockConfStart = 
        trimmed.toUpperCase().includes('[CONFERENCIA ESTOQUE]') ||
        trimmed.toUpperCase().includes('[CONFERÊNCIA ESTOQUE]') ||
        trimmed.includes('=== CONFERÊNCIA FÍSICA E QUANTITATIVA DE ESTOQUE ===') ||
        trimmed.includes('=== CONFERENCIA FISICA E QUANTITATIVA DE ESTOQUE ===');

      if (isStockConfStart) {
        skippingStockConference = true;
        continue;
      }

      if (skippingStockConference) {
        const isNextBlock = 
          trimmed.startsWith('[OCORRÊNCIA') ||
          trimmed.startsWith('[OCORRENCIA') ||
          trimmed.startsWith('2. PENDÊNCIAS') ||
          trimmed.startsWith('2. PENDENCIAS');
        if (isNextBlock) {
          skippingStockConference = false;
        } else {
          continue;
        }
      }

      pendenciasLines.push(line);
    } else if (currentSection === 'PASSAGEM') {
      passagemLines.push(line);
    } else {
      topLines.push(line);
    }
  }

  // Se não foi encontrada a seção de alterações, retorna o texto original
  if (currentSection === '') return desc;

  // Limpar a seção de pendências / ocorrências
  const pendenciasJoined = pendenciasLines.join('\n').trim();
  const pendenciasLimpo = pendenciasJoined
    .replace(/^1\.\s*OCORR[ÊE]NCIAS\s*E\s*EVENTOS\s*REGISTRADOS\s*NO\s*LIVRO\s*DIGITAL:\s*$/im, '')
    .trim();

  let finalAlteracoes = '';
  let hasRealAlteracoes = false;

  if (!pendenciasLimpo || pendenciasLimpo === 'Nenhuma alteração, ocorrência ou pendência registrada durante o plantão.') {
    finalAlteracoes = 'Nenhuma alteração, ocorrência ou pendência registrada durante o plantão.';
    hasRealAlteracoes = false;
  } else {
    finalAlteracoes = pendenciasJoined;
    hasRealAlteracoes = true;
  }

  let finalPassagem = passagemLines.join('\n').trim();
  if (!hasRealAlteracoes && finalPassagem.includes('com as seguintes alterações')) {
    finalPassagem = finalPassagem.replace('com as seguintes alterações', 'sem alterações');
  }

  return [
    topLines.join('\n').trim(),
    '',
    'SITUAÇÃO DAS ALTERAÇÕES E PENDÊNCIAS DO SERVIÇO',
    finalAlteracoes,
    '',
    'PASSAGEM DE SERVIÇO',
    finalPassagem
  ].join('\n');
}

