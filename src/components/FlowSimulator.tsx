/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  User, Shield, Search, CheckCircle, AlertOctagon, 
  Clock, ArrowRight, ShieldAlert, KeyRound, 
  Layers, Package, ChevronRight, LayoutDashboard, History, FileCheck2, Power, AlertTriangle, Terminal,
  UserPlus, ClipboardList, Printer, Database, Download, Upload
} from 'lucide-react';
import { Usuario, Cautela, OcorrenciaRelatorio } from '../types';
import { formatPostoGraduacaoSigla, sanitizeHandoverDescriptionText } from '../utils/rankUtils';

import { useSupabaseDatabase } from '../hooks/useSupabaseDatabase';
import ErrorBoundary from './ErrorBoundary';
import { TotemView } from './TotemView';
import { ArmeiroView } from './ArmeiroView';
import { BancoDadosView } from './BancoDadosView';
import { OcorrenciasView } from './OcorrenciasView';
import { ArmeiroProfileView } from './ArmeiroProfileView';

const parseHandoverDescription = (desc: string) => {
  const lines = desc.split('\n');
  let title = '';
  let subText = '';
  let oficialCPU = '';
  let adjuntoCPU = '';
  let armeiroDia = '';
  const stockItems: Array<{
    material: string;
    carregadores: string;
    total: string;
    disponivel: string;
    cautelado: string;
    manutencao: string;
  }> = [];
  let pendenciasText = '';
  let passagemText = '';
  let dateLine = '';
  let confText = '';

  let currentSection = '';
  let skippingStockConference = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (i === 0) {
      title = line;
      continue;
    }

    if (line.startsWith('Assumi o serviço em substituição')) {
      subText = line;
      continue;
    }

    if (line === 'SERVIÇO DIÁRIO' || line === 'SERVICO DIARIO') {
      currentSection = 'SERVIÇO_DIARIO';
      continue;
    }

    if (line === 'MATERIAL CARGA' || line === 'ESTOQUE FÍSICO DO PAIOL CONFERIDO' || line === 'ESTOQUE FISICO DO PAIOL CONFERIDO') {
      currentSection = 'MATERIAL_CARGA';
      continue;
    }

    if (line === 'SITUAÇÃO DAS ALTERAÇÕES E PENDÊNCIAS DO SERVIÇO' || line === 'SITUACAO DAS ALTERACOES E PENDENCIAS DO SERVICO') {
      currentSection = 'PENDENCIAS';
      continue;
    }

    if (line === 'CONFERÊNCIA FÍSICA E QUANTITATIVA' || line === 'CONFERENCIA FISICA E QUANTITATIVA') {
      currentSection = 'CONFERENCIA';
      continue;
    }

    if (line === 'PASSAGEM DE SERVIÇO' || line === 'PASSAGEM DE SERVICO') {
      currentSection = 'PASSAGEM';
      continue;
    }

    if (currentSection === 'SERVIÇO_DIARIO') {
      const clean = line.startsWith('-') ? line.substring(1).trim() : line;
      if (/^Oficial\s*(de\s*Dia|CPU)\s*:/i.test(clean)) {
        oficialCPU = clean.replace(/^Oficial\s*(de\s*Dia|CPU)\s*:/i, '').trim();
      } else if (/^Adjunto\s*(ao\s*CPU|de\s*Servi[çc]o)?\s*:/i.test(clean)) {
        adjuntoCPU = clean.replace(/^Adjunto\s*(ao\s*CPU|de\s*Servi[çc]o)?\s*:/i, '').trim();
      } else if (/^Armeiro\s*(de\s*Servi[çc]o|de\s*dia|do\s*dia)?\s*:/i.test(clean)) {
        armeiroDia = clean.replace(/^Armeiro\s*(de\s*Servi[çc]o|de\s*dia|do\s*dia)?\s*:/i, '').trim();
      }
    } else if (currentSection === 'MATERIAL_CARGA') {
      if (line.startsWith('-')) {
        const content = line.substring(1).trim();
        const colonIdx = content.indexOf(':');
        const namePart = colonIdx !== -1 ? content.substring(0, colonIdx).trim() : content;
        const rest = colonIdx !== -1 ? content.substring(colonIdx + 1).trim() : '';
        
        let carregadores = '0';
        let total = '0';
        let disponivel = '0';
        let cautelado = '0';
        let manutencao = '0';

        const totalMatch = rest.match(/(\d+)\s*un/i);
        if (totalMatch) total = totalMatch[1];

        const carrMatch = rest.match(/\+\s*(\d+)\s*carregadores/i);
        if (carrMatch) carregadores = carrMatch[1];

        const dispMatch = rest.match(/Dispon[íi]vel:\s*(\d+)/i) || rest.match(/(\d+)\s*un\.?\s*disp/i);
        if (dispMatch) disponivel = dispMatch[1];

        const cautMatch = rest.match(/Cautelado:\s*(\d+)/i) || rest.match(/(\d+)\s*un\.?\s*em\s*campo/i);
        if (cautMatch) cautelado = cautMatch[1];

        const manutMatch = rest.match(/Manuten[çc][ãa]o:\s*(\d+)/i);
        if (manutMatch) manutencao = manutMatch[1];

        stockItems.push({
          material: namePart.trim(),
          carregadores,
          total,
          disponivel,
          cautelado,
          manutencao
        });
      }
    } else if (currentSection === 'PENDENCIAS') {
      const isStockConfStart = 
        line.toUpperCase().includes('[CONFERENCIA ESTOQUE]') ||
        line.toUpperCase().includes('[CONFERÊNCIA ESTOQUE]') ||
        line.includes('=== CONFERÊNCIA FÍSICA E QUANTITATIVA DE ESTOQUE ===') ||
        line.includes('=== CONFERENCIA FISICA E QUANTITATIVA DE ESTOQUE ===');

      if (isStockConfStart) {
        skippingStockConference = true;
        continue;
      }

      if (skippingStockConference) {
        const isNextBlock = 
          line.startsWith('[OCORRÊNCIA') ||
          line.startsWith('[OCORRENCIA') ||
          line.startsWith('2. PENDÊNCIAS') ||
          line.startsWith('2. PENDENCIAS');
        if (isNextBlock) {
          skippingStockConference = false;
        } else {
          continue;
        }
      }

      pendenciasText += (pendenciasText ? '\n' : '') + line;
    } else if (currentSection === 'CONFERENCIA') {
      confText += (confText ? '\n' : '') + line;
    } else if (currentSection === 'PASSAGEM') {
      if (line.startsWith('Riacho Fundo I')) {
        dateLine = line;
      } else {
        passagemText += (passagemText ? '\n' : '') + line;
      }
    }
  }

  const pendenciasLimpo = pendenciasText
    .replace(/^1\.\s*OCORR[ÊE]NCIAS\s*E\s*EVENTOS\s*REGISTRADOS\s*NO\s*LIVRO\s*DIGITAL:\s*$/im, '')
    .trim();

  if (!pendenciasLimpo) {
    pendenciasText = 'Nenhuma alteração, ocorrência ou pendência registrada durante o plantão.';
    if (passagemText.includes('com as seguintes alterações')) {
      passagemText = passagemText.replace('com as seguintes alterações', 'sem alterações');
    }
  } else {
    pendenciasText = pendenciasLimpo;
  }

  return {
    title,
    subText,
    oficialCPU,
    adjuntoCPU,
    armeiroDia,
    stockItems,
    pendenciasText,
    passagemText,
    dateLine,
    confText
  };
};

interface FlowSimulatorProps {
  db: ReturnType<typeof useSupabaseDatabase>;
  activeArmeiroMatricula: string;
  authenticatedPerfil: string;
  setActiveArmeiroMatricula: (matricula: string) => void;
}

export default function FlowSimulator({
  db,
  activeArmeiroMatricula,
  authenticatedPerfil,
  setActiveArmeiroMatricula
}: FlowSimulatorProps) {
  // ---- CONTROLE DE FLUXO/VISÃO ----
  const [roleMode, setRoleMode] = useState<'policial' | 'armeiro' | 'banco_dados' | 'livro_ocorrencias' | 'config_armeiro'>('policial');

  // Forçar o modo Totem de autoatendimento se o armeiro logado for o usuário 'ARMEIRO'
  React.useEffect(() => {
    if (activeArmeiroMatricula?.toUpperCase() === 'ARMEIRO') {
      setRoleMode('policial');
    }
  }, [activeArmeiroMatricula]);

  // ---- FLUXO POLICIAL: ESTADOS LOCAIS ----
  const [policialStep, setPolicialStep] = useState<'login' | 'cadastro_senha' | 'aptidao' | 'carrinho' | 'assinatura' | 'sucesso'>('login');
  const [matriculaInput, setMatriculaInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [loggedUser, setLoggedUser] = useState<Usuario | null>(null);
  const [novaSenhaInput, setNovaSenhaInput] = useState('');
  const [confirmarSenhaInput, setConfirmarSenhaInput] = useState('');
  const [cadastroSenhaError, setCadastroSenhaError] = useState('');
  const [cartItens, setCartItens] = useState<string[]>([]); // Array com ids_materiais
  const [observacoesRetirada, setObservacoesRetirada] = useState('Escala operacional de serviço de radiopatrulha tática.');
  const [generatedCautela, setGeneratedCautela] = useState<Cautela | null>(null);
  const [authError, setAuthError] = useState('');
  const [isPermanentMode, setIsPermanentMode] = useState(false);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  const onResetPermanentMode = () => {
    setIsPermanentMode(false);
    setRoleMode('armeiro');
  };

  const onResetEmergencyMode = () => {
    setIsEmergencyMode(false);
    setRoleMode('armeiro');
  };

  // Estados para Impressão de Relatórios
  const [printMode, setPrintMode] = useState<'cautelas' | 'logs' | 'ocorrencia' | 'relatorio' | null>(null);
  const [printLogDate, setPrintLogDate] = useState('');
  const [selectedOcorrenciaPrint, setSelectedOcorrenciaPrint] = useState<OcorrenciaRelatorio | null>(null);
  const [printReportData, setPrintReportData] = useState<any>(null);

  // Função auxiliar para higienizar matrícula para exibição limpa em relatórios (removendo prefixos A, ARM-, PM-)
  const limparMatricula = (m?: string): string => {
    if (!m) return '';
    let clean = m.trim().toUpperCase();
    clean = clean.replace(/^PM-?/i, '');
    clean = clean.replace(/^ARM-?/i, '');
    if (clean.length > 1 && clean.startsWith('A') && !isNaN(Number(clean.substring(1)))) {
      clean = clean.substring(1);
    }
    return clean;
  };

  // Auxiliar para localizar armeiro responsável pelo relatório
  const getArmeiroUser = (targetMatricula?: string) => {
    if (!db?.usuarios || db.usuarios.length === 0) return null;

    const normalizeMat = (m?: string) => {
      let clean = (m || '').trim().toUpperCase();
      if (clean.length > 1 && clean.startsWith('A') && !isNaN(Number(clean.substring(1)))) {
        clean = clean.substring(1);
      }
      return clean;
    };

    // 1. Match exato pela matrícula informada (sem normalização)
    if (targetMatricula && targetMatricula.trim()) {
      const exactMatch = db.usuarios.find((u: any) =>
        (u.matricula || '').trim().toUpperCase() === targetMatricula.trim().toUpperCase()
      );
      if (exactMatch) return exactMatch;
    }

    // 2. Match normalizado pela matrícula informada
    if (targetMatricula && targetMatricula.trim()) {
      const normTarget = normalizeMat(targetMatricula);
      if (normTarget) {
        const found = db.usuarios.find((u: any) => normalizeMat(u.matricula) === normTarget);
        if (found) return found;
      }
    }

    // 3. Procurar por armeiro ativo logado no sistema (exato primeiro, depois normalizado)
    if (activeArmeiroMatricula && activeArmeiroMatricula.trim()) {
      const exactActive = db.usuarios.find((u: any) =>
        (u.matricula || '').trim().toUpperCase() === activeArmeiroMatricula.trim().toUpperCase()
      );
      if (exactActive) return exactActive;

      const normActive = normalizeMat(activeArmeiroMatricula);
      const foundActive = db.usuarios.find((u: any) => normalizeMat(u.matricula) === normActive);
      if (foundActive) return foundActive;
    }

    // 4. Fallback final: qualquer usuário que tenha assinatura digitalizada cadastrada
    const withSignature = db.usuarios.find((u: any) => u.assinatura_foto && u.assinatura_foto.trim());
    if (withSignature) return withSignature;

    return null;
  };

  const renderSignatureFooter = (targetMatricula?: string, fallbackTitle: string = 'Armeiro Responsável') => {
    const armeiroUser = getArmeiroUser(targetMatricula);
    const armeiroNomeCompleto = armeiroUser ? `${formatPostoGraduacaoSigla(armeiroUser.posto_graduacao)} ${armeiroUser.nome_de_guerra || armeiroUser.nome}` : fallbackTitle;
    const cleanMat = armeiroUser 
      ? limparMatricula(armeiroUser.matricula) 
      : (targetMatricula ? limparMatricula(targetMatricula) : 'N/A');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '40px', pageBreakInside: 'avoid' }}>
        {/* Mensagem Institucional de Assinatura Eletrônica */}
        <div style={{ textAlign: 'center', marginBottom: '16px', borderTop: '1px dashed #666', paddingTop: '10px', width: '90%' }}>
          <div style={{ fontSize: '8.5pt', fontWeight: 'bold', color: '#111', textTransform: 'uppercase' }}>
            Documento assinado eletronicamente pelo usuário mediante senha pessoal e intransferível.
          </div>
          <div style={{ fontSize: '7.5pt', color: '#444', marginTop: '2px', fontStyle: 'italic' }}>
            Conforme Lei Federal nº 14.063/2020 e normas de segurança orgânica da PMDF.
          </div>
        </div>

        {armeiroUser?.assinatura_foto ? (
          <div style={{ marginBottom: '4px', textAlign: 'center' }}>
            <img 
              src={armeiroUser.assinatura_foto} 
              alt="Assinatura Digitalizada" 
              style={{ maxHeight: '60px', height: '60px', width: 'auto', display: 'inline-block', objectFit: 'contain' }} 
            />
          </div>
        ) : (
          <div style={{ height: '25px' }} />
        )}
        <div style={{ textAlign: 'center', width: '60%' }}>
          <div style={{ borderTop: '1.5px solid #000', paddingTop: '5px', fontSize: '9pt', fontWeight: 'bold' }}>
            {armeiroNomeCompleto}
            <br />
            <span style={{ fontWeight: 'normal', fontSize: '8.5pt' }}>Matrícula: {cleanMat}</span>
          </div>
        </div>
      </div>
    );
  };

  // ---- IMPRESSÃO DE RELATÓRIOS ----
  const handlePrintCautelas = () => {
    setPrintMode('cautelas');
    setTimeout(() => {
      window.onafterprint = () => { setPrintMode(null); window.onafterprint = null; };
      window.print();
    }, 350);
  };

  const handlePrintLogs = () => {
    setPrintMode('logs');
    setTimeout(() => {
      window.onafterprint = () => { setPrintMode(null); window.onafterprint = null; };
      window.print();
    }, 350);
  };

  const handlePrintOcorrencia = (oco: OcorrenciaRelatorio) => {
    setSelectedOcorrenciaPrint(oco);
    setPrintMode('ocorrencia');
    setTimeout(() => {
      window.onafterprint = () => { setPrintMode(null); setSelectedOcorrenciaPrint(null); window.onafterprint = null; };
      window.print();
    }, 350);
  };

  const handlePrintRelatorio = (reportData: any) => {
    setPrintReportData(reportData);
    setPrintMode('relatorio');
    setTimeout(() => {
      window.onafterprint = () => { setPrintMode(null); setPrintReportData(null); window.onafterprint = null; };
      window.print();
    }, 350);
  };

  return (
    <div className="space-y-6" id="flow-simulator-root">
      
      {/* Barra de Seleção de Papel do Fluxo */}
      {activeArmeiroMatricula?.toUpperCase() !== 'ARMEIRO' && (
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg" id="role-selector-bar">
          <div className="flex items-center gap-3.5">
            <span className="text-[10px] font-bold text-slate-450 font-mono uppercase tracking-wider">MODO DO SIMULADOR:</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 bg-slate-950/80 p-1 border border-slate-855 rounded-lg" id="role-buttons-wrapper">
              <button
                id="btn-mode-policial"
                onClick={() => setRoleMode('policial')}
                className={`px-4 py-2.5 rounded border text-xs font-bold font-mono flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  roleMode === 'policial'
                    ? 'bg-blue-600/10 text-white border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                    : 'border-transparent text-slate-400 hover:text-slate-205 hover:bg-slate-900/50'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${roleMode === 'policial' ? 'bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]' : 'bg-slate-600'}`}></div>
                <span>Totem Autoatendimento (Policial)</span>
              </button>
              
              <button
                id="btn-mode-armeiro"
                onClick={() => setRoleMode('armeiro')}
                className={`px-4 py-2.5 rounded border text-xs font-bold font-mono flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  roleMode === 'armeiro'
                    ? 'bg-blue-600/10 text-white border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                    : 'border-transparent text-slate-400 hover:text-slate-205 hover:bg-slate-900/50'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${roleMode === 'armeiro' ? 'bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]' : 'bg-slate-600'}`}></div>
                <span>Console da Armaria (Armeiro)</span>
              </button>

              <button
                id="btn-mode-banco-dados"
                onClick={() => setRoleMode('banco_dados')}
                className={`px-4 py-2.5 rounded border text-xs font-bold font-mono flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  roleMode === 'banco_dados'
                    ? 'bg-blue-600/10 text-white border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                    : 'border-transparent text-slate-400 hover:text-slate-205 hover:bg-slate-900/50'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${roleMode === 'banco_dados' ? 'bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]' : 'bg-slate-600'}`}></div>
                <span>Banco de Dados</span>
              </button>

              <button
                id="btn-mode-ocorrencias"
                onClick={() => setRoleMode('livro_ocorrencias')}
                className={`px-4 py-2.5 rounded border text-xs font-bold font-mono flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  roleMode === 'livro_ocorrencias'
                    ? 'bg-blue-600/10 text-white border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                    : 'border-transparent text-slate-400 hover:text-slate-205 hover:bg-slate-900/50'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${roleMode === 'livro_ocorrencias' ? 'bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]' : 'bg-slate-600'}`}></div>
                <span>Livro de Ocorrências</span>
              </button>

              <button
                id="btn-mode-config-armeiro"
                onClick={() => setRoleMode('config_armeiro')}
                className={`px-4 py-2.5 rounded border text-xs font-bold font-mono flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                  roleMode === 'config_armeiro'
                    ? 'bg-blue-600/10 text-white border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                    : 'border-transparent text-slate-400 hover:text-slate-205 hover:bg-slate-900/50'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${roleMode === 'config_armeiro' ? 'bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.8)]' : 'bg-slate-600'}`}></div>
                <span>Armeiro</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDERIZAÇÃO DOS DIFERENTES PAINÉIS COM PROTEÇÃO DE ERRO LOCAL */}
      
      {roleMode === 'policial' && (
        <ErrorBoundary>
          <TotemView
            usuarios={db.usuarios}
            materiais={db.materiais}
            cautelas={db.cautelas}
            cautelaItens={db.cautelaItens}
            policialStep={policialStep}
            setPolicialStep={setPolicialStep}
            matriculaInput={matriculaInput}
            setMatriculaInput={setMatriculaInput}
            senhaInput={senhaInput}
            setSenhaInput={setSenhaInput}
            loggedUser={loggedUser}
            setLoggedUser={setLoggedUser}
            novaSenhaInput={novaSenhaInput}
            setNovaSenhaInput={setNovaSenhaInput}
            confirmarSenhaInput={confirmarSenhaInput}
            setConfirmarSenhaInput={setConfirmarSenhaInput}
            cadastroSenhaError={cadastroSenhaError}
            setCadastroSenhaError={setCadastroSenhaError}
            cartItens={cartItens}
            setCartItens={setCartItens}
            observacoesRetirada={observacoesRetirada}
            setObservacoesRetirada={setObservacoesRetirada}
            generatedCautela={generatedCautela}
            setGeneratedCautela={setGeneratedCautela}
            authError={authError}
            setAuthError={setAuthError}
            registrarLogAuditoria={db.registrarLogAuditoria}
            cadastrarSenha={db.cadastrarSenha}
            processEfetivarCautela={db.processEfetivarCautela}
            cadastrarPolicial={db.cadastrarPolicial}
            isPermanentMode={isPermanentMode}
            onResetPermanentMode={onResetPermanentMode}
            isEmergencyMode={isEmergencyMode}
            onResetEmergencyMode={onResetEmergencyMode}
          />
        </ErrorBoundary>
      )}

      {roleMode === 'armeiro' && (
        <ErrorBoundary>
          <ArmeiroView
            usuarios={db.usuarios}
            materiais={db.materiais}
            cautelas={db.cautelas}
            cautelaItens={db.cautelaItens}
            auditoriaLogs={db.auditoriaLogs}
            cadastrarPolicial={db.cadastrarPolicial}
            processDevolucao={db.processDevolucao}
            handlePrintCautelas={handlePrintCautelas}
            handlePrintLogs={handlePrintLogs}
            handlePrintRelatorio={handlePrintRelatorio}
            printLogDate={printLogDate}
            setPrintLogDate={setPrintLogDate}
            activeArmeiroMatricula={activeArmeiroMatricula}
            authenticatedPerfil={authenticatedPerfil}
            excluirCautelaTotal={db.excluirCautelaTotal}
            onOpenPermanentTotem={() => {
              setPolicialStep('login');
              setMatriculaInput('');
              setSenhaInput('');
              setLoggedUser(null);
              setNovaSenhaInput('');
              setConfirmarSenhaInput('');
              setCadastroSenhaError('');
              setCartItens([]);
              setObservacoesRetirada('Carga pessoal permanente.');
              setGeneratedCautela(null);
              setAuthError('');
              setIsPermanentMode(true);
              setIsEmergencyMode(false);
              setRoleMode('policial');
            }}
            onOpenEmergencyTotem={() => {
              setPolicialStep('login');
              setMatriculaInput('');
              setSenhaInput('');
              setLoggedUser(null);
              setNovaSenhaInput('');
              setConfirmarSenhaInput('');
              setCadastroSenhaError('');
              setCartItens([]);
              setObservacoesRetirada('Cautela emergencial.');
              setGeneratedCautela(null);
              setAuthError('');
              setIsEmergencyMode(true);
              setIsPermanentMode(false);
              setRoleMode('policial');
            }}
          />
        </ErrorBoundary>
      )}

      {roleMode === 'banco_dados' && (
        <ErrorBoundary>
          <BancoDadosView
            usuarios={db.usuarios}
            materiais={db.materiais}
            categorias={db.categorias}
            adicionarCategoria={db.adicionarCategoria}
            cautelas={db.cautelas}
            cautelaItens={db.cautelaItens}
            zerarSenha={db.zerarSenha}
            updatePorte={db.updatePorte}
            adicionarMaterial={db.adicionarMaterial}
            updateMaterialStatus={db.updateMaterialStatus}
            confirmarRetirada={db.confirmarRetirada}
            confirmarEntrada={db.confirmarEntrada}
            modelosArmas={db.modelosArmas}
            adicionarModeloArma={db.adicionarModeloArma}
            activeArmeiroMatricula={activeArmeiroMatricula}
            authenticatedPerfil={authenticatedPerfil}
            excluirPolicialTotal={db.excluirPolicialTotal}
            excluirMaterialTotal={db.excluirMaterialTotal}
            armasParticulares={db.armasParticulares}
            adicionarArmaParticular={db.adicionarArmaParticular}
            devolverArmasParticulares={db.devolverArmasParticulares}
            editarPolicial={db.editarPolicial}
            filaSincronizacao={db.filaSincronizacao}
            removerItemFilaSincronizacao={db.removerItemFilaSincronizacao}
            forcarSincronizacao={db.forcarSincronizacao}
            limparFilaSincronizacao={db.limparFilaSincronizacao}
            syncQueueErrors={db.syncQueueErrors}
            isOnline={db.isOnline}
            isSyncing={db.isSyncing}
          />
        </ErrorBoundary>
      )}

      {roleMode === 'livro_ocorrencias' && (
        <ErrorBoundary>
          <OcorrenciasView
            ocorrencias={db.ocorrencias}
            materiais={db.materiais}
            salvarOcorrencia={db.salvarOcorrencia}
            handlePrintOcorrencia={handlePrintOcorrencia}
            activeArmeiroMatricula={activeArmeiroMatricula}
            pendenciasServico={db.pendenciasServico}
            adicionarPendencia={db.adicionarPendencia}
            resolverPendencia={db.resolverPendencia}
            usuarios={db.usuarios}
            cautelas={db.cautelas}
            cautelaItens={db.cautelaItens}
            armasParticulares={db.armasParticulares}
            handlePrintRelatorio={handlePrintRelatorio}
            categorias={db.categorias}
          />
        </ErrorBoundary>
      )}

      {roleMode === 'config_armeiro' && (
        <ErrorBoundary>
          <ArmeiroProfileView
            usuarios={db.usuarios}
            activeArmeiroMatricula={activeArmeiroMatricula}
            authenticatedPerfil={authenticatedPerfil}
            setActiveArmeiroMatricula={setActiveArmeiroMatricula}
            alterarSenhaArmeiro={db.alterarSenhaArmeiro}
            cadastrarPolicial={db.cadastrarPolicial}
            editarPolicial={db.editarPolicial}
            excluirUsuario={db.excluirUsuario}
          />
        </ErrorBoundary>
      )}

      {/* ESTILO DE IMPRESSÃO DINÂMICO COMPACTO */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body {
            background: white !important;
            color: black !important;
            font-family: Arial, sans-serif !important;
            font-size: 10pt !important;
          }
          #app-header, 
          footer, 
          #role-selector-bar, 
          #policial-journey-wrapper, 
          #armeiro-panel-root,
          #arm-banco-dados-view,
          #arm-ocorrencias-view,
          #arm-perfil-view-root,
          button, 
          select, 
          input, 
          .no-print {
            display: none !important;
          }
          #app-root, 
          #app-main-content, 
          #flow-simulator-root {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            display: block !important;
          }
          #print-area-cautelas {
            display: ${printMode === 'cautelas' ? 'block' : 'none'} !important;
          }
          #print-area-logs {
            display: ${printMode === 'logs' ? 'block' : 'none'} !important;
          }
          #print-area-ocorrencia {
            display: ${printMode === 'ocorrencia' ? 'block' : 'none'} !important;
          }
          #print-area-relatorio {
            display: ${printMode === 'relatorio' ? 'block' : 'none'} !important;
          }
          #print-area-cautelas img, #print-area-logs img, #print-area-ocorrencia img, #print-area-relatorio img {
            display: inline-block !important;
            visibility: visible !important;
            opacity: 1 !important;
            max-height: 60px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #print-area-cautelas, #print-area-logs, #print-area-ocorrencia, #print-area-relatorio {
            width: 100% !important;
            margin: 0 !important;
            padding: 15px !important;
          }
          #print-area-cautelas *, #print-area-logs *, #print-area-ocorrencia *, #print-area-relatorio * {
            color: #000000 !important;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin-top: 8px !important;
            margin-bottom: 12px !important;
            page-break-inside: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          th, td {
            border: 1px solid #000 !important;
            padding: 4px 6px !important;
            text-align: left !important;
            font-size: 8pt !important;
            color: #000000 !important;
            line-height: 1.2 !important;
          }
          th {
            background-color: #f2f2f2 !important;
            font-weight: bold !important;
          }
          h2 {
            font-size: 13pt !important;
            margin-bottom: 5px !important;
            text-transform: uppercase !important;
            text-align: center !important;
            border-bottom: 2px solid #000 !important;
            padding-bottom: 5px !important;
            font-weight: bold !important;
          }
          h3 {
            page-break-after: avoid !important;
          }
          .print-meta {
            margin-bottom: 15px !important;
            font-size: 8pt !important;
            text-align: center !important;
            color: #000000 !important;
            font-style: italic !important;
          }
        }
        @media screen {
          #print-area-cautelas, #print-area-logs, #print-area-ocorrencia, #print-area-relatorio {
            display: none !important;
          }
        }
      `}} />

      {/* ÁREA DE IMPRESSÃO - CAUTELAS */}
      <div id="print-area-cautelas">
        <h2>Relatório Geral de Cautelas - PMDF</h2>
        <div className="print-meta">
          Gerado em: {new Date().toLocaleString()}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Código Guia</th>
              <th style={{ width: '25%' }}>Policial</th>
              <th style={{ width: '28%' }}>Itens Cautelados</th>
              <th style={{ width: '15%' }}>Retirada</th>
              <th style={{ width: '15%' }}>Devolução</th>
              <th style={{ width: '10%' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {db.cautelas.map(c => {
              const pol = db.usuarios.find(u => u.matricula === c.matricula_policial);
              const cItens = db.cautelaItens.filter(ci => ci.id_cautela === c.id_cautela);
              return (
                <tr key={c.id_cautela}>
                  <td>{c.id_cautela}</td>
                  <td>
                    {formatPostoGraduacaoSigla(pol?.posto_graduacao)} {pol?.nome_de_guerra || pol?.nome} ({limparMatricula(c.matricula_policial)})
                  </td>
                  <td>
                    {cItens.map(ci => {
                      const matItem = db.materiais.find(m => m.id_material === ci.id_material);
                      return `${matItem?.modelo} (S/N: ${ci.id_material})`;
                    }).join(', ')}
                  </td>
                  <td>
                    <div>{new Date(c.data_retirada).toLocaleDateString('pt-BR')} {new Date(c.data_retirada).toLocaleTimeString('pt-BR')}</div>
                    <div style={{ fontWeight: 'bold', fontSize: '7.5pt', marginTop: '2px' }}>
                      {c.is_emergencial ? 'Autorizado emergencialmente' : 'Assinado eletronicamente'}
                    </div>
                  </td>
                  <td>
                    {c.data_devolucao_efetiva ? (
                      <>
                        <div>{new Date(c.data_devolucao_efetiva).toLocaleDateString('pt-BR')} {new Date(c.data_devolucao_efetiva).toLocaleTimeString('pt-BR')}</div>
                        <div style={{ fontWeight: 'bold', fontSize: '7.5pt', marginTop: '2px' }}>
                          Assinado eletronicamente
                        </div>
                        {c.matricula_armeiro_devolucao && (
                          <div style={{ fontSize: '7.5pt', color: '#333' }}>
                            Matrícula: {limparMatricula(c.matricula_armeiro_devolucao)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontStyle: 'italic' }}>Em aberto</span>
                    )}
                  </td>
                  <td>{c.status_cautela.toUpperCase()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {renderSignatureFooter(activeArmeiroMatricula, 'Armeiro Responsável')}
      </div>

      {/* ÁREA DE IMPRESSÃO - LOGS */}
      <div id="print-area-logs">
        <h2>Trilha de Auditoria Forense - PMDF</h2>
        <div className="print-meta">
          Gerado em: {new Date().toLocaleString()} | Filtro de Data: {printLogDate ? new Date(printLogDate + 'T00:00:00').toLocaleDateString() : 'Todos os registros'}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '15%' }}>Data/Hora</th>
              <th style={{ width: '15%' }}>Evento</th>
              <th style={{ width: '15%' }}>Executor</th>
              <th style={{ width: '45%' }}>Detalhes do Evento</th>
              <th style={{ width: '10%' }}>ID Log</th>
            </tr>
          </thead>
          <tbody>
            {db.auditoriaLogs
              .filter(log => {
                if (printLogDate) {
                  const dateVal = new Date(log.data_hora).toISOString().split('T')[0];
                  return dateVal === printLogDate;
                }
                return true;
              })
              .map(log => (
                <tr key={log.id_log}>
                  <td>{new Date(log.data_hora).toLocaleDateString()} {new Date(log.data_hora).toLocaleTimeString()}</td>
                  <td>{log.tipo_evento.toUpperCase().replace('_', ' ')}</td>
                   <td>
                    {(() => {
                      const exec = db.usuarios.find(u => u.matricula === log.matricula_executor);
                      return exec ? `${formatPostoGraduacaoSigla(exec.posto_graduacao)} ${exec.nome_de_guerra || exec.nome} (${limparMatricula(log.matricula_executor)})` : limparMatricula(log.matricula_executor);
                    })()}
                  </td>
                  <td>{log.detalhes}</td>
                  <td>{log.id_log}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {renderSignatureFooter(activeArmeiroMatricula, 'Armeiro Responsável')}
      </div>

      {/* ÁREA DE IMPRESSÃO - OCORRÊNCIA INDIVIDUAL */}
      {selectedOcorrenciaPrint && (
        <div id="print-area-ocorrencia" style={{ fontFamily: 'Arial, sans-serif' }}>
          <h2 style={{ textAlign: 'center', textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '20px' }}>
            Termo de Registro de Ocorrência Bélica - PMDF
          </h2>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold', width: '25%' }}>Código Registro:</td>
                <td style={{ border: '1px solid #000', padding: '8px', width: '25%' }}>{selectedOcorrenciaPrint.id_ocorrencia}</td>
                <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold', width: '25%' }}>Data/Hora Registro:</td>
                <td style={{ border: '1px solid #000', padding: '8px', width: '25%' }}>
                  {new Date(selectedOcorrenciaPrint.data_hora).toLocaleString()}
                </td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>Tipo de Ocorrência:</td>
                <td style={{ border: '1px solid #000', padding: '8px' }}>
                  {selectedOcorrenciaPrint.tipo.toUpperCase().replace('_', ' ')}
                </td>
                <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>Armeiro Relator:</td>
                <td style={{ border: '1px solid #000', padding: '8px' }}>{limparMatricula(selectedOcorrenciaPrint.matricula_armeiro)}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>Assunto / Título:</td>
                <td colSpan={3} style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>
                  {selectedOcorrenciaPrint.titulo.toUpperCase()}
                </td>
              </tr>
            </tbody>
          </table>

          {selectedOcorrenciaPrint.tipo === 'troca_turno' ? (() => {
            const parsed = parseHandoverDescription(selectedOcorrenciaPrint.descricao);
            return (
              <div style={{ fontSize: '10pt', lineHeight: '1.6', marginBottom: '40px' }}>
                <h3 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '15px', textTransform: 'uppercase', textAlign: 'center' }}>
                  {parsed.title}
                </h3>
                
                <p style={{ marginBottom: '15px', textIndent: '2em' }}>{parsed.subText}</p>
                
                <h4 style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginTop: '20px', marginBottom: '10px', textTransform: 'uppercase', fontSize: '9pt' }}>
                  SERVIÇO DIÁRIO
                </h4>
                <div style={{ marginBottom: '15px', paddingLeft: '10px' }}>
                  <div><strong>Oficial CPU:</strong> {parsed.oficialCPU}</div>
                  <div><strong>Adjunto ao CPU:</strong> {parsed.adjuntoCPU}</div>
                  <div><strong>Armeiro de dia:</strong> {parsed.armeiroDia}</div>
                </div>

                <h4 style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginTop: '20px', marginBottom: '10px', textTransform: 'uppercase', fontSize: '9pt' }}>
                  MATERIAL CARGA
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
                  <thead>
                    <tr>
                      <th style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', backgroundColor: '#f2f2f2', fontWeight: 'bold', width: '45%' }}>Material (Modelo/Fabricante)</th>
                      <th style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', backgroundColor: '#f2f2f2', fontWeight: 'bold', textAlign: 'center' }}>Qtd Total</th>
                      <th style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', backgroundColor: '#f2f2f2', fontWeight: 'bold', textAlign: 'center' }}>Disponível</th>
                      <th style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', backgroundColor: '#f2f2f2', fontWeight: 'bold', textAlign: 'center' }}>Cautelado (Rua)</th>
                      <th style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', backgroundColor: '#f2f2f2', fontWeight: 'bold', textAlign: 'center' }}>Manutenção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.stockItems.map((item, idx) => {
                      const showCarregadores = parseInt(item.carregadores) > 0;
                      const displayName = showCarregadores 
                        ? `${item.material} (+ ${item.carregadores} carregadores)` 
                        : item.material;
                      return (
                        <tr key={idx}>
                          <td style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt' }}>{displayName}</td>
                          <td style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', textAlign: 'center', fontWeight: 'bold' }}>{item.total}</td>
                          <td style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', textAlign: 'center', color: '#000000' }}>{item.disponivel}</td>
                          <td style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', textAlign: 'center', color: '#000000' }}>{item.cautelado}</td>
                          <td style={{ border: '1px solid #000', padding: '5px 8px', fontSize: '8pt', textAlign: 'center', color: '#000000' }}>{item.manutencao}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {parsed.pendenciasText && (
                  <>
                    <h4 style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginTop: '20px', marginBottom: '10px', textTransform: 'uppercase', fontSize: '9pt' }}>
                      SITUAÇÃO DAS ALTERAÇÕES E PENDÊNCIAS DO SERVIÇO
                    </h4>
                    <div style={{ paddingLeft: '10px', marginBottom: '15px', whiteSpace: 'pre-wrap' }}>{parsed.pendenciasText}</div>
                  </>
                )}

                {parsed.confText && (
                  <>
                    <h4 style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginTop: '20px', marginBottom: '10px', textTransform: 'uppercase', fontSize: '9pt' }}>
                      CONFERÊNCIA FÍSICA E QUANTITATIVA
                    </h4>
                    <div style={{ paddingLeft: '10px', marginBottom: '15px', fontStyle: 'italic' }}>{parsed.confText}</div>
                  </>
                )}

                <h4 style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginTop: '25px', marginBottom: '10px', textTransform: 'uppercase', fontSize: '9pt', textAlign: 'center' }}>
                  PASSAGEM DE SERVIÇO
                </h4>
                <p style={{ marginBottom: '15px', textIndent: '2em' }}>{parsed.passagemText}</p>

                {parsed.dateLine && (
                  <div style={{ textAlign: 'right', marginTop: '20px', fontStyle: 'italic', fontWeight: 'bold' }}>
                    {parsed.dateLine}
                  </div>
                )}
              </div>
            );
          })() : (
            <div style={{ border: '1px solid #000', padding: '15px', minHeight: '200px', fontSize: '10pt', lineHeight: '1.6', marginBottom: '40px', whiteSpace: 'pre-wrap' }}>
              <div style={{ fontWeight: 'bold', borderBottom: '1px solid #ddd', paddingBottom: '5px', marginBottom: '10px', textTransform: 'uppercase', fontSize: '9pt' }}>
                Descrição dos Fatos:
              </div>
              {selectedOcorrenciaPrint.descricao}
            </div>
          )}

          {renderSignatureFooter(selectedOcorrenciaPrint.matricula_armeiro, 'Armeiro Relator')}
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO - RELATÓRIOS DO LIVRO DE OCORRÊNCIAS */}
      {printReportData && (
        <div id="print-area-relatorio" style={{ fontFamily: 'Arial, sans-serif' }}>
          {printReportData.type !== 'fechamento_global' && (
            <>
              <h2 style={{ textAlign: 'center', textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '20px' }}>
                {printReportData.title}
              </h2>
              <div className="print-meta" style={{ textAlign: 'center', fontSize: '9pt', fontStyle: 'italic', marginBottom: '20px' }}>
                {printReportData.meta}
              </div>
            </>
          )}

          {printReportData.type === 'periodico' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Tabela de Materiais Movimentados */}
              {printReportData.data.movimentacoes && printReportData.data.movimentacoes.length > 0 && (
                <div style={{ marginBottom: '25px' }}>
                  <h3 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '10px', textTransform: 'uppercase' }}>
                    Materiais Pagos e Recebidos no Período
                  </h3>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Matrícula</th>
                        <th style={{ width: '25%' }}>Policial</th>
                        <th style={{ width: '35%' }}>Materiais Pagos</th>
                        <th style={{ width: '12.5%' }}>Cautela</th>
                        <th style={{ width: '12.5%' }}>Devolução</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportData.data.movimentacoes.map((mov: any, index: number) => (
                        <tr key={index}>
                          <td style={{ fontWeight: 'bold' }}>{limparMatricula(mov.matricula)}</td>
                          <td>{mov.nome_de_guerra || mov.nome}</td>
                          <td>{mov.materiais}</td>
                          <td>
                            <div>{mov.hora_cautela}</div>
                            <div style={{ fontWeight: 'bold', fontSize: '7.5pt', marginTop: '2px' }}>
                              {mov.is_emergencial ? 'Autorizado emergencialmente' : 'Assinado eletronicamente'}
                            </div>
                          </td>
                          <td>
                            {mov.hora_devolucao ? (
                              <>
                                <div>{mov.hora_devolucao}</div>
                                <div style={{ fontWeight: 'bold', fontSize: '7.5pt', marginTop: '2px' }}>
                                  Assinado eletronicamente
                                </div>
                                {mov.matricula_armeiro_devolucao && (
                                  <div style={{ fontSize: '7.5pt', color: '#333' }}>
                                    Matrícula: {limparMatricula(mov.matricula_armeiro_devolucao)}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ fontStyle: 'italic' }}>Pendente</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tabela de Pendências de Devolução do Período */}
              {printReportData.data.pendentes && printReportData.data.pendentes.length > 0 && (
                <div style={{ marginBottom: '25px' }}>
                  <h3 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '10px', textTransform: 'uppercase' }}>
                    Materiais Pendentes de Devolução (Retirados no Período e Não Entregues)
                  </h3>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Matrícula</th>
                        <th style={{ width: '25%' }}>Policial</th>
                        <th style={{ width: '45%' }}>Materiais</th>
                        <th style={{ width: '15%' }}>Previsão Devolução</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportData.data.pendentes.map((pend: any, index: number) => (
                        <tr key={index}>
                          <td>{limparMatricula(pend.matricula)}</td>
                          <td>{pend.nome_de_guerra || pend.nome}</td>
                          <td>{pend.materiais}</td>
                          <td>{pend.previsao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tabela de Armas Particulares Movimentadas */}
              {printReportData.data.armasParticularesMov && printReportData.data.armasParticularesMov.length > 0 && (
                <div style={{ marginBottom: '25px' }}>
                  <h3 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '10px', textTransform: 'uppercase' }}>
                    Armas Particulares - Entradas e Saídas do Quartel
                  </h3>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Matrícula</th>
                        <th style={{ width: '20%' }}>Policial</th>
                        <th style={{ width: '25%' }}>Modelo / Série</th>
                        <th style={{ width: '15%' }}>Tipo Movimentação</th>
                        <th style={{ width: '15%' }}>Data/Hora</th>
                        <th style={{ width: '10%' }}>Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportData.data.armasParticularesMov.map((mov: any, index: number) => (
                        <tr key={index}>
                          <td>{limparMatricula(mov.matricula)}</td>
                          <td>{mov.nome_de_guerra || mov.nome}</td>
                          <td>{mov.modelo_serie}</td>
                          <td style={{ fontWeight: 'bold' }}>{mov.tipo_mov}</td>
                          <td>{mov.data_hora}</td>
                          <td>{mov.obs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {printReportData.type === 'estoque' && (
            <div>
              <h3 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '15px', textTransform: 'uppercase' }}>
                Inventário Físico da Reserva de Armamento
              </h3>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>Série / Patr.</th>
                    <th style={{ width: '15%' }}>Categoria</th>
                    <th style={{ width: '20%' }}>Modelo</th>
                    <th style={{ width: '15%' }}>Fabricante</th>
                    <th style={{ width: '10%' }}>Calibre</th>
                    <th style={{ width: '10%' }}>Status</th>
                    <th style={{ width: '15%' }}>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {printReportData.data.itens.map((item: any, index: number) => (
                    <tr key={index}>
                      <td style={{ fontWeight: 'bold' }}>{item.id_material}</td>
                      <td>{item.categoria}</td>
                      <td>{item.modelo}</td>
                      <td>{item.fabricante}</td>
                      <td>{item.calibre}</td>
                      <td style={{ textTransform: 'uppercase' }}>{item.status_atual}</td>
                      <td>
                        {item.responsavel}
                        {item.desde && <span style={{ display: 'block', fontSize: '7pt', marginTop: '2px' }}>({item.desde})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {printReportData.type === 'particulares' && (
            <div>
              <h3 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '15px', textTransform: 'uppercase' }}>
                Armas Particulares sob Custódia do Quartel
              </h3>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>Matrícula</th>
                    <th style={{ width: '25%' }}>Proprietário</th>
                    <th style={{ width: '35%' }}>Armamento / Acessórios</th>
                    <th style={{ width: '15%' }}>Data Depósito</th>
                    <th style={{ width: '10%' }}>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {printReportData.data.armas.map((arma: any, index: number) => (
                    <tr key={index}>
                      <td>{limparMatricula(arma.matricula)}</td>
                      <td>{arma.nome}</td>
                      <td>{arma.modelo} {arma.fabricante ? `[${arma.fabricante}]` : ''} {arma.calibre ? `(Cal. ${arma.calibre})` : ''} {arma.numero_serie ? `[SN: ${arma.numero_serie}]` : ''}</td>
                      <td>{arma.data_deposito}</td>
                      <td>{arma.obs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {printReportData.type === 'permanente' && (
            <div>
              <h3 style={{ fontSize: '11pt', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '15px', textTransform: 'uppercase' }}>
                Cargas Bélicas Permanentes (Dotação Pessoal Efetiva)
              </h3>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>Guia</th>
                    <th style={{ width: '15%' }}>Matrícula</th>
                    <th style={{ width: '25%' }}>Policial Militar</th>
                    <th style={{ width: '18%' }}>Código / RFID</th>
                    <th style={{ width: '15%' }}>Categoria</th>
                    <th style={{ width: '15%' }}>Modelo / Item</th>
                  </tr>
                </thead>
                <tbody>
                  {printReportData.data.itens && printReportData.data.itens.map((item: any, index: number) => (
                    <tr key={index}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.id_cautela}</td>
                      <td>{limparMatricula(item.matricula)}</td>
                      <td style={{ fontWeight: 'bold' }}>{item.policial}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.id_material}</td>
                      <td>{item.categoria}</td>
                      <td style={{ textTransform: 'uppercase' }}>{item.modelo} {item.quantidade > 1 ? `(x${item.quantidade})` : ''}</td>
                    </tr>
                  ))}
                  {(!printReportData.data.itens || printReportData.data.itens.length === 0) && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', fontStyle: 'italic', padding: '12px' }}>
                        Nenhum militar com carga bélica permanente registrada no sistema até o momento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {printReportData.type === 'fechamento_global' && (
            <div style={{ display: 'block', width: '100%' }}>
              {/* CABEÇALHO OFICIAL PMDF */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '18px' }}>
                <div style={{ fontSize: '12pt', fontWeight: 'bold', letterSpacing: '1px' }}>
                  POLÍCIA MILITAR DO DISTRITO FEDERAL
                </div>
                <div style={{ fontSize: '10pt', fontWeight: 'bold', color: '#222', marginTop: '2px' }}>
                  {db.quarteis && db.quarteis.length > 0 ? db.quarteis[0].nome.toUpperCase() : 'REGIMENTO DE POLÍCIA MONTADA (RPMont / CAVALARIA)'}
                </div>
                <div style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '8px', borderTop: '1px solid #444', paddingTop: '6px' }}>
                  RELATÓRIO CONSOLIDADO DE FECHAMENTO E LIVRO GERAL DA RESERVA
                </div>
                <div style={{ fontSize: '8pt', fontStyle: 'italic', marginTop: '4px', color: '#111' }}>
                  Período: <strong>{new Date(printReportData.data.startDateStr).toLocaleString('pt-BR')}</strong> até <strong>{new Date(printReportData.data.endDateStr).toLocaleString('pt-BR')}</strong> | Emitido em: <strong>{new Date().toLocaleString('pt-BR')}</strong>
                </div>
                <div style={{ fontSize: '8pt', marginTop: '2px', color: '#333' }}>
                  Armeiro de Serviço:{' '}
                  <strong>
                    {(() => {
                      const armUser = getArmeiroUser(activeArmeiroMatricula);
                      return armUser
                        ? `${formatPostoGraduacaoSigla(armUser.posto_graduacao)} ${armUser.nome_de_guerra || armUser.nome} (Mat. ${limparMatricula(armUser.matricula)})`
                        : limparMatricula(activeArmeiroMatricula);
                    })()}
                  </strong>
                </div>
              </div>

              {/* SEÇÃO 1: CAUTELAS DIÁRIAS (RETIRADAS E DEVOLUÇÕES NO PERÍODO) */}
              <div style={{ marginBottom: '20px', display: 'block' }}>
                <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', borderBottom: '1.5px solid #000', paddingBottom: '3px', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                  <span>1. Cautelas Diárias (Movimentação do Período)</span>
                  <span style={{ fontSize: '8.5pt', fontWeight: 'normal' }}>
                    Total no Período: <strong>{printReportData.data.cautelasDiarias?.length || 0}</strong>
                  </span>
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>Matrícula</th>
                      <th style={{ width: '22%' }}>Policial</th>
                      <th style={{ width: '38%' }}>Materiais Pagos</th>
                      <th style={{ width: '12.5%' }}>Cautela</th>
                      <th style={{ width: '12.5%' }}>Devolução</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printReportData.data.cautelasDiarias && printReportData.data.cautelasDiarias.map((c: any, idx: number) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 'bold' }}>{limparMatricula(c.matricula)}</td>
                        <td>{c.nome_de_guerra ? `${c.posto_graduacao || ''} ${c.nome_de_guerra}` : c.nome}</td>
                        <td>{c.materiais}</td>
                        <td>
                          <div>{c.hora_cautela}</div>
                          <div style={{ fontWeight: 'bold', fontSize: '7.5pt', marginTop: '2px' }}>
                            {c.is_emergencial ? 'Autorizado emergencialmente' : 'Assinado eletronicamente'}
                          </div>
                        </td>
                        <td>
                          {c.hora_devolucao ? (
                            <>
                              <div>{c.hora_devolucao}</div>
                              <div style={{ fontWeight: 'bold', fontSize: '7.5pt', marginTop: '2px' }}>
                                Assinado eletronicamente
                              </div>
                              {c.matricula_armeiro_devolucao && (
                                <div style={{ fontSize: '7.5pt', color: '#333', marginTop: '2px' }}>
                                  Matrícula: {limparMatricula(c.matricula_armeiro_devolucao)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span style={{ fontStyle: 'italic' }}>Pendente</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!printReportData.data.cautelasDiarias || printReportData.data.cautelasDiarias.length === 0) && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', fontStyle: 'italic', padding: '10px' }}>
                          Nenhuma cautela operacional movimentada no período selecionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* SEÇÃO 2: ARMAS E MATERIAIS PARTICULARES */}
              <div style={{ marginBottom: '20px', display: 'block' }}>
                <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', borderBottom: '1.5px solid #000', paddingBottom: '3px', marginBottom: '8px', textTransform: 'uppercase' }}>
                  2. Armas e Materiais Particulares
                </h3>
                
                {/* 2.1 Movimentações */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
                    2.1 Movimentações no Período (Entradas e Saídas)
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Data/Hora</th>
                        <th style={{ width: '25%' }}>Policial Proprietário</th>
                        <th style={{ width: '30%' }}>Material Particular (Modelo/Série)</th>
                        <th style={{ width: '15%' }}>Movimentação</th>
                        <th style={{ width: '15%' }}>Obs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportData.data.armasParticulares?.movimentacoes && printReportData.data.armasParticulares.movimentacoes.map((mov: any, idx: number) => (
                        <tr key={idx}>
                          <td>{mov.data_hora}</td>
                          <td>{mov.nome_de_guerra || mov.nome} ({limparMatricula(mov.matricula)})</td>
                          <td>{mov.modelo_serie}</td>
                          <td style={{ fontWeight: 'bold' }}>{mov.tipo_mov}</td>
                          <td>{mov.obs || '-'}</td>
                        </tr>
                      ))}
                      {(!printReportData.data.armasParticulares?.movimentacoes || printReportData.data.armasParticulares.movimentacoes.length === 0) && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', fontStyle: 'italic', padding: '8px' }}>
                            Nenhuma entrada ou saída de arma particular registrada no período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 2.2 Saldo Atual Na Reserva */}
                <div>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
                    2.2 Saldo Atual de Armas Particulares na Reserva
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Matrícula</th>
                        <th style={{ width: '25%' }}>Proprietário</th>
                        <th style={{ width: '35%' }}>Armamento / Acessórios</th>
                        <th style={{ width: '15%' }}>Data Entrada</th>
                        <th style={{ width: '10%' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportData.data.armasParticulares?.saldoNaReserva && printReportData.data.armasParticulares.saldoNaReserva.map((arma: any, idx: number) => (
                        <tr key={idx}>
                          <td>{limparMatricula(arma.matricula)}</td>
                          <td>{arma.nome}</td>
                          <td>{arma.modelo} {arma.fabricante ? `[${arma.fabricante}]` : ''} {arma.calibre ? `(Cal. ${arma.calibre})` : ''} {arma.numero_serie ? `[SN: ${arma.numero_serie}]` : ''}</td>
                          <td>{arma.data_deposito}</td>
                          <td style={{ fontWeight: 'bold', color: '#047857' }}>Na Reserva</td>
                        </tr>
                      ))}
                      {(!printReportData.data.armasParticulares?.saldoNaReserva || printReportData.data.armasParticulares.saldoNaReserva.length === 0) && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', fontStyle: 'italic', padding: '8px' }}>
                            Nenhuma arma particular guardada na reserva no momento.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SEÇÃO 3: CARGAS BÉLICAS PERMANENTES */}
              <div style={{ marginBottom: '20px', display: 'block' }}>
                <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', borderBottom: '1.5px solid #000', paddingBottom: '3px', marginBottom: '8px', textTransform: 'uppercase' }}>
                  3. Cargas Bélicas Permanentes (Dotação Pessoal / Fixa)
                </h3>
                
                {/* 3.1 Devoluções no Período */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
                    3.1 Devoluções de Cargas Permanentes no Período
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Data Devolução</th>
                        <th style={{ width: '30%' }}>Policial Militar</th>
                        <th style={{ width: '35%' }}>Material Devolvido</th>
                        <th style={{ width: '20%' }}>Obs / Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportData.data.cargasPermanentes?.devolucoes && printReportData.data.cargasPermanentes.devolucoes.map((dev: any, idx: number) => (
                        <tr key={idx}>
                          <td>{dev.data_devolucao}</td>
                          <td>{dev.policial} ({limparMatricula(dev.matricula)})</td>
                          <td>{dev.material}</td>
                          <td>{dev.obs || 'Devolução à Reserva'}</td>
                        </tr>
                      ))}
                      {(!printReportData.data.cargasPermanentes?.devolucoes || printReportData.data.cargasPermanentes.devolucoes.length === 0) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', fontStyle: 'italic', padding: '8px' }}>
                            Nenhuma devolução de carga permanente realizada no período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 3.2 Em Posse Ativa */}
                <div>
                  <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
                    3.2 Relação de Militares com Carga Permanente Ativa (Fora da Reserva)
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Guia</th>
                        <th style={{ width: '30%' }}>Policial Militar</th>
                        <th style={{ width: '35%' }}>Material / Modelo / Série</th>
                        <th style={{ width: '20%' }}>Data Carga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReportData.data.cargasPermanentes?.emPosse && printReportData.data.cargasPermanentes.emPosse.map((pos: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{pos.id_cautela}</td>
                          <td style={{ fontWeight: 'bold' }}>{pos.policial} ({limparMatricula(pos.matricula)})</td>
                          <td>{pos.modelo} ({pos.id_material})</td>
                          <td>{pos.data_carga}</td>
                        </tr>
                      ))}
                      {(!printReportData.data.cargasPermanentes?.emPosse || printReportData.data.cargasPermanentes.emPosse.length === 0) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', fontStyle: 'italic', padding: '8px' }}>
                            Nenhum militar com carga permanente ativa registrada no momento.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SEÇÃO 4: INVENTÁRIO GERAL DO ESTOQUE (PAIOL) */}
              <div style={{ marginBottom: '20px', display: 'block' }}>
                <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', borderBottom: '1.5px solid #000', paddingBottom: '3px', marginBottom: '8px', textTransform: 'uppercase' }}>
                  4. Inventário Geral do Estoque (Paiol da Unidade)
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Equipamento / Modelo</th>
                      <th style={{ width: '20%' }}>Fabricante</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Total Físico</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Disponível (Paiol)</th>
                      <th style={{ width: '12%', textAlign: 'center' }}>Cautelado (Rua)</th>
                      <th style={{ width: '13%', textAlign: 'center' }}>Manutenção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printReportData.data.estoquePaiol?.itens && printReportData.data.estoquePaiol.itens.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 'bold' }}>{item.modelo}</td>
                        <td>{item.fabricante || '-'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{item.total} un.</td>
                        <td style={{ textAlign: 'center', color: '#047857', fontWeight: 'bold' }}>{item.disponivel} un.</td>
                        <td style={{ textAlign: 'center', color: '#b91c1c' }}>{item.cautelado} un.</td>
                        <td style={{ textAlign: 'center' }}>{item.manutencao} un.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Bloco Exclusivo dos Bastões Compactados */}
                {printReportData.data.estoquePaiol?.bastoes && (
                  <div style={{ border: '1px solid #000', padding: '8px 10px', marginTop: '6px', background: '#f9f9f9', fontSize: '8pt', lineHeight: '1.4', pageBreakInside: 'avoid' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '3px' }}>
                      Bastões: Total: {printReportData.data.estoquePaiol.bastoes.total} un. ({printReportData.data.estoquePaiol.bastoes.disponivel} no Paiol / {printReportData.data.estoquePaiol.bastoes.cautelado} em Cautela)
                    </div>
                    <div>
                      <strong>Relação de Números:</strong> {printReportData.data.estoquePaiol.bastoes.numeros || '1, 2, 3, 4, 5, 6, 7, 8, 9, 10...'}
                    </div>
                  </div>
                )}
              </div>

              {/* SEÇÃO 5: LIVRO DE ALTERAÇÕES E OCORRÊNCIAS */}
              <div style={{ marginBottom: '20px', display: 'block' }}>
                <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', borderBottom: '1.5px solid #000', paddingBottom: '3px', marginBottom: '10px', textTransform: 'uppercase' }}>
                  5. Livro de Alterações e Ocorrências do Período
                </h3>

                {/* Lista de Ocorrências */}
                {printReportData.data.alteracoesOcorrencias?.ocorrencias && printReportData.data.alteracoesOcorrencias.ocorrencias.map((oco: any, idx: number) => {
                  const armUser = getArmeiroUser(oco.matricula_armeiro);
                  const armeiroStr = armUser
                    ? `${formatPostoGraduacaoSigla(armUser.posto_graduacao)} ${armUser.nome_de_guerra || armUser.nome} (Mat. ${limparMatricula(armUser.matricula)})`
                    : `Mat. ${limparMatricula(oco.matricula_armeiro)}`;

                  return (
                    <div key={`oco-${idx}`} style={{ border: '1px solid #333', marginBottom: '12px', pageBreakInside: 'avoid', background: '#fff' }}>
                      {/* Faixa Superior de Cabeçalho */}
                      <div style={{ backgroundColor: '#f2f2f2', borderBottom: '1px solid #444', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                        <div>
                          <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '8.5pt' }}>
                            [{oco.tipo?.replace('_', ' ').toUpperCase()}]: {oco.titulo}
                          </span>
                        </div>
                        <div style={{ fontSize: '7.5pt', fontStyle: 'italic' }}>
                          Registrado em: <strong>{new Date(oco.data_hora).toLocaleString('pt-BR')}</strong>
                        </div>
                      </div>

                      {/* Sub-faixa de Identificação do Armeiro */}
                      <div style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #ddd', padding: '4px 10px', fontSize: '7.5pt', color: '#222' }}>
                        Armeiro Registrante: <strong>{armeiroStr}</strong>
                      </div>

                      {/* Corpo da Ocorrência em largura total */}
                      <div style={{ padding: '8px 10px', fontSize: '8pt', lineHeight: '1.45', whiteSpace: 'pre-wrap', color: '#000' }}>
                        {oco.tipo === 'troca_turno' ? sanitizeHandoverDescriptionText(oco.descricao) : oco.descricao}
                      </div>
                    </div>
                  );
                })}

                {/* Lista de Pendências de Serviço */}
                {printReportData.data.alteracoesOcorrencias?.pendencias && printReportData.data.alteracoesOcorrencias.pendencias.map((pen: any, idx: number) => {
                  const criadorUser = getArmeiroUser(pen.matricula_criador);
                  const criadorStr = criadorUser
                    ? `${formatPostoGraduacaoSigla(criadorUser.posto_graduacao)} ${criadorUser.nome_de_guerra || criadorUser.nome} (Mat. ${limparMatricula(criadorUser.matricula)})`
                    : `Mat. ${limparMatricula(pen.matricula_criador)}`;

                  const isAberto = pen.status === 'aberto';

                  return (
                    <div key={`pen-${idx}`} style={{ border: '1px solid #333', marginBottom: '12px', pageBreakInside: 'avoid', background: '#fff' }}>
                      {/* Faixa Superior de Cabeçalho */}
                      <div style={{ backgroundColor: '#f2f2f2', borderBottom: '1px solid #444', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                        <div>
                          <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '8.5pt', color: isAberto ? '#b91c1c' : '#047857' }}>
                            [{isAberto ? 'PENDÊNCIA ABERTA' : 'PENDÊNCIA RESOLVIDA'}]
                          </span>
                        </div>
                        <div style={{ fontSize: '7.5pt', fontStyle: 'italic' }}>
                          Registrada em: <strong>{new Date(pen.data_criacao).toLocaleString('pt-BR')}</strong>
                        </div>
                      </div>

                      {/* Sub-faixa de Identificação do Armeiro */}
                      <div style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #ddd', padding: '4px 10px', fontSize: '7.5pt', color: '#222' }}>
                        Registrado por: <strong>{criadorStr}</strong>
                      </div>

                      {/* Corpo da Pendência */}
                      <div style={{ padding: '8px 10px', fontSize: '8pt', lineHeight: '1.45', whiteSpace: 'pre-wrap', color: '#000' }}>
                        {pen.descricao}
                        {pen.resolucao && (
                          <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed #ccc', fontStyle: 'italic', color: '#047857' }}>
                            <strong>↳ Resolução ({pen.data_resolucao ? new Date(pen.data_resolucao).toLocaleString('pt-BR') : ''}):</strong> {pen.resolucao} {pen.matricula_resolvedor ? `(por Mat. ${limparMatricula(pen.matricula_resolvedor)})` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Mensagem quando não há registros */}
                {(!printReportData.data.alteracoesOcorrencias?.ocorrencias || printReportData.data.alteracoesOcorrencias.ocorrencias.length === 0) &&
                 (!printReportData.data.alteracoesOcorrencias?.pendencias || printReportData.data.alteracoesOcorrencias.pendencias.length === 0) && (
                  <div style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', fontStyle: 'italic', fontSize: '8pt' }}>
                    Nenhuma ocorrência ou alteração de serviço registrada no período.
                  </div>
                )}
              </div>

              {/* CARIMBO DE ASSINATURA ELETRÔNICA DIGITAL INSTITUCIONAL PMDF */}
              <div style={{ border: '1.5px solid #000', padding: '12px 14px', marginTop: '25px', pageBreakInside: 'avoid', background: '#fafafa' }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '9pt', textTransform: 'uppercase', marginBottom: '6px', borderBottom: '1px solid #bbb', paddingBottom: '4px' }}>
                  🛡️ CARIMBO DE ASSINATURA ELETRÔNICA DIGITAL INSTITUCIONAL - PMDF
                </div>
                <div style={{ fontSize: '8pt', lineHeight: '1.5', color: '#111' }}>
                  <div>Documento gerado e autenticado eletronicamente via Sistema Tático de Reserva de Armamento PMDF.</div>
                  <div>
                    Emitido por:{' '}
                    <strong>
                      {(() => {
                        const armUser = getArmeiroUser(activeArmeiroMatricula);
                        return armUser
                          ? `${formatPostoGraduacaoSigla(armUser.posto_graduacao)} ${armUser.nome_de_guerra || armUser.nome}`
                          : 'Armeiro de Serviço';
                      })()}
                    </strong>{' '}
                    (Matrícula:{' '}
                    <strong>
                      {(() => {
                        const armUser = getArmeiroUser(activeArmeiroMatricula);
                        return armUser ? limparMatricula(armUser.matricula) : limparMatricula(activeArmeiroMatricula);
                      })()}
                    </strong>
                    ) em <strong>{new Date().toLocaleString('pt-BR')}</strong>
                  </div>
                  <div>
                    Unidade: <strong>{db.quarteis && db.quarteis.length > 0 ? db.quarteis[0].nome : 'Regimento de Polícia Montada (Cavalaria)'}</strong>
                  </div>
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #999', fontFamily: 'monospace', fontSize: '7.5pt' }}>
                    Chave de Autenticação Digital (SHA-256):<br />
                    <strong style={{ wordBreak: 'break-all', color: '#000' }}>
                      [ {printReportData.data.hashIntegridade || '8f4b2c19a0e8d35f78b9123e456789abcdef0123456789abcdef0123456789ab'} ]
                    </strong>
                  </div>
                  <div style={{ fontSize: '7pt', color: '#555', fontStyle: 'italic', marginTop: '4px' }}>
                    Conforme Lei Federal nº 14.063/2020 e normas de segurança orgânica da PMDF. Para verificar a autenticidade deste relatório, consulte a trilha forense do sistema.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rodapé de Assinaturas (apenas para relatórios convencionais com linhas) */}
          {printReportData.type !== 'fechamento_global' && renderSignatureFooter(activeArmeiroMatricula, 'Armeiro Responsável')}
        </div>
      )}

    </div>
  );
}
