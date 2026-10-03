export interface AgentToolConfig {
  tool_names: string[];
  deny_patterns?: string[];
}

export interface AgentDefinition {
  id: string;
  role: string;
  system_prompt_extra?: string;
  tool_config: AgentToolConfig;
  model_override?: string;
}

export const CODER_AGENT_DEF: AgentDefinition = {
  id: "coder",
  role: "Code Specialist",
  tool_config: {
    tool_names: [
      "file_read", "file_write", "file_edit", "file_delete", "file_list", "file_search", "file_append",
      "shell_run", "shell_python",
      "code_lint", "code_format", "code_tree", "code_analyze",
      "git_status", "git_diff", "git_log", "git_add", "git_commit", "git_branch", "git_checkout", "git_push", "git_pull", "git_stash",
      "axodex_query", "axodex_context", "axodex_smart_read", "axodex_impact", "axodex_detect_changes", "axodex_status", "axodex_analyze",
      "done", "absolute_query", "get_time"
    ]
  }
};

export const RESEARCH_AGENT_DEF: AgentDefinition = {
  id: "researcher",
  role: "Research Specialist",
  tool_config: {
    tool_names: [
      "file_read", "file_list", "file_search", "file_write", "file_append",
      "web_get", "web_search",
      "axodex_query", "axodex_context", "axodex_smart_read",
      "memory_save", "memory_get", "memory_list",
      "palace_search", "palace_context", "palace_wings", "palace_rooms", "palace_check_dup", "palace_graph_traverse", "palace_find_tunnels", "palace_graph_stats",
      "kg_query", "kg_timeline", "kg_stats",
      "done", "absolute_query", "get_time"
    ]
  }
};

export const FILE_AGENT_DEF: AgentDefinition = {
  id: "file_manager",
  role: "File Management Specialist",
  tool_config: {
    tool_names: [
      "file_read", "file_write", "file_edit", "file_delete", "file_list", "file_search", "file_append",
      "code_tree",
      "done", "get_time"
    ]
  }
};
