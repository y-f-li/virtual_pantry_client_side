/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecipesPage from "@/recipes/page";

const pushMock = jest.fn();
const getMock = jest.fn();
const postMock = jest.fn();
const successMock = jest.fn();
const errorMock = jest.fn();
const apiMock = { get: getMock, post: postMock };

let mockHouseholds: any[] = [];
let mockSelectedHouseholdId: number | null = null;
let mockQuery = new Map<string, string>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({
    get: (key: string) => mockQuery.get(key) ?? null,
  }),
}));

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => apiMock,
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "households") {
      return { value: mockHouseholds, set: jest.fn(), clear: jest.fn() };
    }
    if (key === "selectedHouseholdId") {
      return {
        value: mockSelectedHouseholdId,
        set: jest.fn(),
        clear: jest.fn(),
      };
    }
    return { value: "", set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

jest.mock("antd", () => {
  const App = {
    useApp: () => ({
      message: { success: successMock, error: errorMock },
    }),
  };
  const Alert = ({ message, description }: any) => (
    <div>
      <span>{message}</span>
      <span>{description}</span>
    </div>
  );
  const Button = ({ children, onClick, disabled, loading, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-loading={loading ? "true" : undefined} {...props}>
      {children}
    </button>
  );
  const Card = ({ children }: any) => <div>{children}</div>;
  const Empty = ({ description }: any) => <div>{description}</div>;
  const Modal = ({ open, title, children, footer }: any) =>
    open ? (
      <div role="dialog">
        <h2>{title}</h2>
        {children}
        <div>{footer}</div>
      </div>
    ) : null;
  const Skeleton = () => <div>loading recipes</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Text: ({ children }: any) => <span>{children}</span>,
  };

  return { Alert, App, Button, Card, Empty, Modal, Skeleton, Space, Tag, Typography };
});

jest.mock("@ant-design/icons", () => ({
  CheckCircleOutlined: () => <span />,
  FireOutlined: () => <span />,
  ReloadOutlined: () => <span />,
  ThunderboltOutlined: () => <span />,
}));

const recipeFixture = {
  id: "tomato-pasta-light",
  title: "Light Tomato Pasta",
  summary: "A simple lower-calorie pasta plate.",
  imageEmoji: "pasta",
  source: "LOCAL_CATALOG",
  servings: 2,
  readyToCook: true,
  matchScore: 92,
  matchedIngredientCount: 1,
  missingIngredientCount: 0,
  healthGoalFit: "Fits the household's lighter calorie goal",
  recommendationReason: "All required ingredients are available in the pantry.",
  caloriesPerServing: 430,
  proteinGrams: 16,
  carbsGrams: 72,
  fatGrams: 9,
  tags: ["balanced", "low_calorie"],
  instructions: ["Boil pasta.", "Warm sauce."],
  ingredients: [
    {
      name: "Pasta",
      amount: 180,
      unit: "g",
      matched: true,
      pantryItemId: 10,
      pantryItemName: "Pasta",
      availableAmount: 300,
      pantryUnit: "g",
      enoughAvailable: true,
    },
  ],
  missingIngredients: [],
};

describe("Recipes page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHouseholds = [{ householdId: 10, name: "Team Kitchen", role: "owner" }];
    mockSelectedHouseholdId = 10;
    mockQuery = new Map([
      ["householdId", "10"],
      ["name", "Team Kitchen"],
    ]);
    getMock.mockResolvedValue([recipeFixture]);
    postMock.mockResolvedValue({
      recipeId: "tomato-pasta-light",
      title: "Light Tomato Pasta",
      servingsCooked: 2,
      consumedCalories: 300,
      consumedIngredients: recipeFixture.ingredients,
    });
  });

  it("loads and renders recipe recommendations", async () => {
    render(<RecipesPage />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/households/10/recipes/recommendations");
    });

    expect(await screen.findByText("Recipes for Team Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Light Tomato Pasta")).toBeInTheDocument();
    expect(screen.getByText("Local recipe")).toBeInTheDocument();
    expect(screen.getByText("Fits the household's lighter calorie goal")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 ingredients matched from pantry.")).toBeInTheDocument();
  });

  it("opens recipe details and cooks the selected recipe", async () => {
    render(<RecipesPage />);

    await screen.findByText("Light Tomato Pasta");
    fireEvent.click(screen.getByRole("button", { name: /Review & cook/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Pantry impact")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cook this recipe/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/households/10/recipes/tomato-pasta-light/cook",
        { servings: 2 },
      );
      expect(successMock).toHaveBeenCalledWith("Light Tomato Pasta cooked. Pantry updated.");
    });
  });

  it("shows an empty household state when no household exists", () => {
    mockHouseholds = [];
    render(<RecipesPage />);

    expect(screen.getByText("Create or join a household before opening recipe recommendations.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Go to Households/i }));
    expect(pushMock).toHaveBeenCalledWith("/households");
  });
});
