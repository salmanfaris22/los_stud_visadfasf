package auth

// ModuleDef is one row of the role permission matrix.
type ModuleDef struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Group string `json:"group"`
}

var Actions = []string{"view", "create", "edit", "delete"}

var Modules = []ModuleDef{
	{"students", "Students & enrollments", "People"},
	{"users", "Staff users", "People"},
	{"roles", "Roles & permissions", "People"},
	{"courses", "Courses, videos & tasks", "Learning"},
	{"batches", "Batches & batch types", "Learning"},
	{"submissions", "Task submissions & reviews", "Learning"},
	{"quizzes", "Quizzes", "Learning"},
	{"certificates", "Certificates", "Learning"},
	{"live", "Live sessions", "Engagement"},
	{"attendance", "Attendance", "Engagement"},
	{"announcements", "Announcements", "Engagement"},
	{"comments", "Video Q&A", "Engagement"},
	{"cms", "Website content", "Website"},
	{"blog", "Blog", "Website"},
	{"leads", "Leads (CRM)", "Sales"},
	{"whatsapp", "WhatsApp inbox & broadcasts", "Sales"},
	{"admissions", "Admissions & fees", "Accounts"},
	{"payments", "Payments, approvals & refunds", "Accounts"},
	{"commissions", "Counsellor commissions", "Accounts"},
	{"finance_reports", "Finance & sales reports", "Accounts"},
	{"sales_settings", "Sales & accounts settings", "Accounts"},
	{"analytics", "Analytics dashboard", "System"},
	{"audit", "Audit log", "System"},
	{"settings", "Settings", "System"},
}

func ValidModule(m string) bool {
	for _, d := range Modules {
		if d.Key == m {
			return true
		}
	}
	return false
}

func ValidAction(a string) bool {
	for _, x := range Actions {
		if x == a {
			return true
		}
	}
	return false
}

// Sales scopes limit which leads, admissions, payments and commissions a role sees.
const (
	SalesAll  = "all"  // everything
	SalesTeam = "team" // own team's counsellors (sales managers)
	SalesOwn  = "own"  // only their own (counsellors)
)

// CounsellorDefaults is the permission set of the built-in Counsellor role (sales scope: own).
var CounsellorDefaults = map[string][]string{
	"leads":       {"view", "create", "edit"},
	"whatsapp":    {"view", "create"},
	"admissions":  {"view", "create"},
	"payments":    {"view", "create"},
	"commissions": {"view"},
	"courses":     {"view"},
	"batches":     {"view"},
}

// SalesManagerDefaults is the permission set of the built-in Sales manager role (sales scope: team).
var SalesManagerDefaults = map[string][]string{
	"leads":           {"view", "create", "edit", "delete"},
	"whatsapp":        {"view", "create", "edit"},
	"admissions":      {"view", "create"},
	"payments":        {"view", "create"},
	"commissions":     {"view"},
	"finance_reports": {"view"},
	"courses":         {"view"},
	"batches":         {"view"},
}

// AccountsDefaults is the permission set of the built-in Accounts role (sales scope: all).
var AccountsDefaults = map[string][]string{
	"admissions":      {"view", "create", "edit", "delete"},
	"payments":        {"view", "create", "edit", "delete"},
	"commissions":     {"view", "create", "edit", "delete"},
	"finance_reports": {"view"},
	"sales_settings":  {"view", "edit"},
	"students":        {"view"},
	"leads":           {"view"},
	"courses":         {"view"},
	"batches":         {"view"},
}

// MentorDefaults is the permission set given to the built-in Mentor role.
var MentorDefaults = map[string][]string{
	"students":      {"view"},
	"courses":       {"view", "create", "edit"},
	"batches":       {"view"},
	"submissions":   {"view", "edit"},
	"quizzes":       {"view", "create", "edit", "delete"},
	"certificates":  {"view"},
	"live":          {"view", "create", "edit", "delete"},
	"attendance":    {"view", "create", "edit"},
	"announcements": {"view", "create", "edit"},
	"comments":      {"view", "create", "edit", "delete"},
	"analytics":     {"view"},
}
